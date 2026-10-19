import { closeSync, copyFileSync, existsSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, realpathSync, renameSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { createHash } from 'node:crypto';

export interface Repository { id: string; cwd: string; allow: string[]; product?: boolean }
export interface Configuration { taskId: string; workspace: string; branch?: string; repositories: Repository[] }
export interface Result { code: number; stdout: Buffer; stderr: Buffer }
export type Runner = (cwd: string, args: string[], env?: Record<string, string>, input?: Uint8Array) => Result;
interface Baseline {
	branch: string; head: string; entries: string; indexPath: string;
	dirty: Record<string, string | null>; originals: Record<string, string | null>;
}
interface Milestone {
	baseline: Baseline; state: 'begun' | 'prepared' | 'intent' | 'reconciled';
	tree?: string; hashes?: Record<string, string | null>; expectedEntries?: string; patchHash?: string;
	message?: string; commit?: string;
}
interface Save { state: 'intent' | 'saved' | 'uncertain'; payload: string; result?: string; receipt?: string }
interface Manifest {
	config: Configuration; files: string[]; initial: Record<string, Baseline>; branches: Record<string, 'intent' | 'ready'>;
	initialized: boolean; milestones: Record<string, Record<string, Milestone>>;
	saves: Partial<Record<'plan' | 'report', Save>>; final?: { verified: boolean; summaryDelivered: boolean };
}
const nativeRunner: Runner = (cwd, args, env = {}, input) => {
	const result = Bun.spawnSync(args, { cwd, env: { ...process.env, ...env, GIT_LITERAL_PATHSPECS: '1' }, stdin: input, stdout: 'pipe', stderr: 'pipe' });
	return { code: result.exitCode, stdout: result.stdout, stderr: result.stderr };
};
function invariant(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
function identifier(value: string) { invariant(/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(value), `Invalid identifier: ${value}`); return value; }
function hash(content: Uint8Array) { return createHash('sha256').update(content).digest('hex'); }
function safePath(root: string, path: string) {
	invariant(path !== '' && !isAbsolute(path) && !path.split(/[\\/]/).some(part => part === '..' || part === '.git'), `Unsafe path: ${path}`);
	const target = resolve(root, path), part = relative(root, target);
	invariant(part !== '' && !part.startsWith(`..${sep}`) && part !== '..' && !isAbsolute(part), 'Path escaped root');
	let cursor = root;
	invariant(!existsSync(root) || !lstatSync(root).isSymbolicLink(), 'Root is a symlink');
	for (const component of part.split(sep)) { cursor = join(cursor, component); const stat = lstatSync(cursor, { throwIfNoEntry: false }); if (stat) invariant(!stat.isSymbolicLink(), `Symlink forbidden: ${cursor}`); }
	return target;
}
function digest(path: string): string | null {
	if (!existsSync(path)) return null;
	const stat = lstatSync(path);
	invariant(stat.isFile(), `Expected ordinary file: ${path}`);
	return hash(readFileSync(path));
}

/** Local deterministic operations only. Callers must serialize Git writers and inspect prepared diffs. */
export class Crew {
	readonly taskDir: string;
	private manifest!: Manifest;
	constructor(readonly config: Configuration, private runner: Runner = nativeRunner) {
		identifier(config.taskId); invariant(config.repositories.length > 0, 'Repositories required');
		config.workspace = realpathSync(config.workspace);
		const ids = new Set<string>(), directories = new Set<string>();
		for (const repo of config.repositories) {
			identifier(repo.id); invariant(!ids.has(repo.id), 'Duplicate repository'); ids.add(repo.id);
			repo.cwd = realpathSync(repo.cwd); invariant(!directories.has(repo.cwd.toLowerCase()), 'Repositories must be distinct'); directories.add(repo.cwd.toLowerCase()); invariant(repo.allow.length > 0 && new Set(repo.allow).size === repo.allow.length, 'Explicit unique allowlist required');
			for (const path of repo.allow) safePath(repo.cwd, path);
			invariant(this.git(repo, ['rev-parse', '--show-toplevel']).toString().trim().replaceAll('\\', '/').toLowerCase() === repo.cwd.replaceAll('\\', '/').toLowerCase(), 'Repository cwd must be its root');
		}
		if (config.branch) {
			invariant(config.branch.startsWith('cycle/'), 'Task branch must start cycle/');
			invariant(config.repositories.filter(repo => repo.product).length === 2, 'Matching branches require both product repositories');
			this.git(config.repositories[0]!, ['check-ref-format', '--branch', config.branch]);
		}
		this.taskDir = safePath(config.workspace, `.codex/crew-runs/${config.taskId}`);
		if (existsSync(join(this.taskDir, 'manifest.json'))) this.load();
	}
	private git(repo: Repository, args: string[], env?: Record<string, string>, input?: Uint8Array) {
		const result = this.runner(repo.cwd, ['git', ...args], env, input);
		invariant(result.code === 0, `git ${args.join(' ')}: ${result.stderr.toString()}`);
		return result.stdout;
	}
	/** CLI callers share one task manifest. A dead process's lock may be reclaimed; a live owner always blocks. */
	withLock<T>(operation: () => T): T {
		mkdirSync(this.taskDir, { recursive: true }); const lock = safePath(this.taskDir, '.operation.lock');
		if (existsSync(lock)) {
			const owner = JSON.parse(readFileSync(lock, 'utf8')) as { pid: number };
			invariant(Number.isSafeInteger(owner.pid) && owner.pid > 0, 'Invalid lock; reconcile manually');
			try { process.kill(owner.pid, 0); throw new Error('Task operation is active; retry after its writer finishes'); }
			catch (error) { invariant((error as NodeJS.ErrnoException).code === 'ESRCH', 'Task operation is active or cannot be checked'); }
			unlinkSync(lock);
		}
		const descriptor = openSync(lock, 'wx'); writeFileSync(descriptor, JSON.stringify({ pid: process.pid })); closeSync(descriptor);
		try { if (existsSync(join(this.taskDir, 'manifest.json'))) this.load(); return operation(); }
		finally { if (existsSync(lock)) unlinkSync(lock); }
	}
	private load() {
		this.manifest = JSON.parse(readFileSync(safePath(this.taskDir, 'manifest.json'), 'utf8'));
		invariant(JSON.stringify(this.manifest.config) === JSON.stringify(this.config), 'Configuration differs from saved task; reconcile explicitly');
	}
	private write(path: string, data: string | Uint8Array) {
		const target = safePath(this.taskDir, path); mkdirSync(dirname(target), { recursive: true });
		if (!this.manifest.files.includes(path)) { this.manifest.files.push(path); this.persist(); }
		const temporary = `${path}.tmp`;
		if (!this.manifest.files.includes(temporary)) { this.manifest.files.push(temporary); this.persist(); }
		writeFileSync(safePath(this.taskDir, temporary), data); renameSync(safePath(this.taskDir, temporary), target);
	}
	private persist() {
		mkdirSync(this.taskDir, { recursive: true });
		writeFileSync(safePath(this.taskDir, 'manifest.json.tmp'), JSON.stringify(this.manifest, null, '\t') + '\n');
		renameSync(safePath(this.taskDir, 'manifest.json.tmp'), safePath(this.taskDir, 'manifest.json'));
	}
	private repo(id: string) { const repo = this.config.repositories.find(repo => repo.id === id); invariant(repo, 'Unknown repository'); return repo; }
	private dirty(repo: Repository) {
		const paths = new Set<string>();
		for (const args of [['diff', '--cached', '--name-only', '-z'], ['diff', '--name-only', '-z'], ['ls-files', '--others', '--exclude-standard', '-z']]) {
			for (const path of this.git(repo, args).toString().split('\0').filter(Boolean)) paths.add(path);
		}
		return Object.fromEntries([...paths].map(path => [path, digest(safePath(repo.cwd, path))]));
	}
	private snapshot(repo: Repository, prefix: string): Baseline {
		invariant(!this.git(repo, ['ls-files', '--unmerged']).length, 'Unmerged index');
		for (const marker of ['MERGE_HEAD', 'CHERRY_PICK_HEAD', 'REVERT_HEAD', 'rebase-merge', 'rebase-apply']) {
			invariant(!existsSync(resolve(repo.cwd, this.git(repo, ['rev-parse', '--git-path', marker]).toString().trim())), 'Unfinished Git operation');
		}
		const branch = this.git(repo, ['branch', '--show-current']).toString().trim(); invariant(branch, 'Detached HEAD unsupported');
		const indexPath = resolve(repo.cwd, this.git(repo, ['rev-parse', '--git-path', 'index']).toString().trim());
		const result: Baseline = { branch, head: this.git(repo, ['rev-parse', 'HEAD']).toString().trim(), indexPath,
			entries: this.git(repo, ['ls-files', '--stage', '-z']).toString('base64'), dirty: this.dirty(repo),
			originals: Object.fromEntries(repo.allow.map(path => { const target = safePath(repo.cwd, path); return [path, existsSync(target) ? readFileSync(target).toString('base64') : null]; })) };
		this.write(`${prefix}.index`, readFileSync(indexPath));
		this.write(`${prefix}.staged.patch`, this.git(repo, ['diff', '--cached', '--binary', '--no-ext-diff', '--no-textconv']));
		this.write(`${prefix}.unstaged.patch`, this.git(repo, ['diff', '--binary', '--no-ext-diff', '--no-textconv']));
		this.write(`${prefix}.status`, this.git(repo, ['status', '--porcelain=v1', '-z', '--untracked-files=all']));
		this.write(`${prefix}.baseline.json`, JSON.stringify(result, null, '\t'));
		return result;
	}
	private indexEntries(repo: Repository, env?: Record<string, string>) { return this.git(repo, ['ls-files', '--stage', '-z'], env).toString('base64'); }
	private verify(repo: Repository, baseline: Baseline, head = baseline.head, entries = baseline.entries) {
		invariant(this.git(repo, ['branch', '--show-current']).toString().trim() === baseline.branch && this.git(repo, ['rev-parse', 'HEAD']).toString().trim() === head, 'Branch/HEAD drift; reconcile');
		invariant(this.indexEntries(repo) === entries, 'Staging drift; reconcile');
		const actual = this.dirty(repo);
		for (const path of new Set([...Object.keys(actual), ...Object.keys(baseline.dirty)])) {
			if (!repo.allow.includes(path)) invariant(actual[path] === baseline.dirty[path], `Unrelated work drift: ${path}`);
		}
	}
	init() {
		if (!this.manifest) {
			invariant(!existsSync(this.taskDir) || readdirSync(this.taskDir).every(path => path === '.operation.lock'), 'Task directory exists without manifest; inspect before recovery');
			this.manifest = { config: this.config, files: ['manifest.json', 'manifest.json.tmp', '.operation.lock'], initial: {}, branches: {}, initialized: false, milestones: {}, saves: {} }; this.persist();
		}
		for (const repo of this.config.repositories) if (!this.manifest.initial[repo.id]) { this.manifest.initial[repo.id] = this.snapshot(repo, `initial-${repo.id}`); this.persist(); }
		if (this.manifest.initialized) return this.recover();
		const products = this.config.repositories.filter(repo => repo.product && this.config.branch);
		for (const repo of this.config.repositories.filter(repo => !products.includes(repo))) this.verify(repo, this.manifest.initial[repo.id]!);
		// Preflight every collision before creating either branch. A recorded intent permits recovery only at the saved base.
		for (const repo of products) {
			const baseline = this.manifest.initial[repo.id]!;
			const ref = this.runner(repo.cwd, ['git', 'show-ref', '--verify', '--quiet', `refs/heads/${this.config.branch}`]);
			invariant(ref.code === 0 || ref.code === 1, 'Cannot inspect branch collision');
			if (ref.code === 0) {
				invariant(this.manifest.branches[repo.id], `Branch collision: ${repo.id}; choose unused task name`);
				invariant(this.git(repo, ['rev-parse', `refs/heads/${this.config.branch}`]).toString().trim() === baseline.head, 'Recorded task branch moved before initialization completed');
			}
			const current = this.git(repo, ['branch', '--show-current']).toString().trim();
			invariant(current === baseline.branch || (this.manifest.branches[repo.id] && current === this.config.branch), 'Unexpected branch during initialization');
			this.verify(repo, { ...baseline, branch: current });
		}
		for (const repo of products) {
			this.manifest.branches[repo.id] = 'intent'; this.persist();
			if (this.git(repo, ['branch', '--show-current']).toString().trim() !== this.config.branch) {
				const found = this.runner(repo.cwd, ['git', 'show-ref', '--verify', '--quiet', `refs/heads/${this.config.branch}`]).code === 0;
				this.git(repo, found ? ['switch', this.config.branch!] : ['switch', '-c', this.config.branch!]);
			}
			this.manifest.branches[repo.id] = 'ready'; this.persist();
		}
		this.manifest.initialized = true; this.persist(); return this.recover();
	}
	begin(repository: string, milestone: string) {
		identifier(milestone); invariant(this.manifest?.initialized, 'Initialize both product branches before implementation');
		const repo = this.repo(repository); const records = this.manifest.milestones[repository] ??= {};
		invariant(!records[milestone], 'Milestone already exists; recover it');
		invariant(Object.values(records).every(record => record.state === 'reconciled'), 'Previous milestone is pending');
		const latest = Object.values(records).at(-1), initial = this.manifest.initial[repository]!;
		const expected = latest?.baseline ?? { ...initial, branch: this.config.branch && repo.product ? this.config.branch : initial.branch };
		this.verify(repo, expected, latest?.commit ?? initial.head, latest?.expectedEntries ?? initial.entries);
		if (latest) this.verifyPrepared(repo, latest);
		else for (const [path, original] of Object.entries(initial.originals)) invariant(digest(safePath(repo.cwd, path)) === (original === null ? null : hash(Buffer.from(original, 'base64'))), `Owned edits precede milestone baseline: ${path}`);
		records[milestone] = { baseline: this.snapshot(repo, `${repository}-${milestone}`), state: 'begun' }; this.persist();
		return { repository, milestone, baseline: records[milestone].baseline.head };
	}
	private operation(repository: string, milestone: string) { const record = this.manifest?.milestones[repository]?.[milestone]; invariant(record, 'Begin milestone before edits'); return record; }
	private prefix(repository: string, milestone: string) { return `${identifier(repository)}-${identifier(milestone)}`; }
	private environment(path: string) { return { GIT_INDEX_FILE: safePath(this.taskDir, path) }; }
	private registerIndex(path: string) { if (!this.manifest.files.includes(path)) { this.manifest.files.push(path, `${path}.lock`); this.persist(); } }
	private overlay(repo: Repository, baseline: Baseline, path: string, data: string | null, env: Record<string, string>) {
		if (data === null) { this.git(repo, ['update-index', '--force-remove', '--', path], env); return; }
		const entry = this.git(repo, ['ls-tree', baseline.head, '--', path]).toString();
		const mode = entry.match(/^(\d+) /)?.[1] ?? '100644'; invariant(mode === '100644' || mode === '100755', 'Only ordinary owned files supported');
		const oid = this.git(repo, ['hash-object', '-w', '--path', path, '--stdin'], {}, Buffer.from(data, 'base64')).toString().trim();
		this.git(repo, ['update-index', '--add', '--cacheinfo', mode, oid, path], env);
	}
	prepare(repository: string, milestone: string) {
		const repo = this.repo(repository), record = this.operation(repository, milestone), prefix = this.prefix(repository, milestone);
		invariant(record.state === 'begun' || record.state === 'prepared', 'Pending commit must be recovered'); this.verify(repo, record.baseline);
		const before = this.environment(`${prefix}-before.index`), after = this.environment(`${prefix}-after.index`), commit = this.environment(`${prefix}-commit.index`), expected = this.environment(`${prefix}-expected.index`);
		for (const suffix of ['before', 'after', 'commit', 'expected']) this.registerIndex(`${prefix}-${suffix}.index`);
		this.git(repo, ['read-tree', record.baseline.head], before);
		for (const path of repo.allow) this.overlay(repo, record.baseline, path, record.baseline.originals[path]!, before);
		const beforeTree = this.git(repo, ['write-tree'], before).toString().trim();
		copyFileSync(before.GIT_INDEX_FILE, after.GIT_INDEX_FILE);
		for (const path of repo.allow) { const target = safePath(repo.cwd, path); this.overlay(repo, record.baseline, path, existsSync(target) ? readFileSync(target).toString('base64') : null, after); }
		const afterTree = this.git(repo, ['write-tree'], after).toString().trim();
		const patch = this.git(repo, ['diff', '--binary', '--full-index', '--no-ext-diff', '--no-textconv', beforeTree, afterTree, '--', ...repo.allow]);
		invariant(patch.length > 0, 'No task changes'); this.write(`${prefix}.task.patch`, patch);
		this.git(repo, ['read-tree', record.baseline.head], commit);
		this.git(repo, ['apply', '--cached', '--check', '--whitespace=nowarn'], commit, patch); this.git(repo, ['apply', '--cached', '--whitespace=nowarn'], commit, patch);
		this.git(repo, ['diff', '--cached', '--check'], commit);
		const names = this.git(repo, ['diff', '--cached', '--name-only', '-z'], commit).toString().split('\0').filter(Boolean);
		invariant(names.every(path => repo.allow.includes(path)), 'Patch escaped allowlist');
		copyFileSync(record.baseline.indexPath, expected.GIT_INDEX_FILE);
		this.git(repo, ['apply', '--cached', '--check', '--whitespace=nowarn'], expected, patch); this.git(repo, ['apply', '--cached', '--whitespace=nowarn'], expected, patch);
		record.patchHash = hash(patch); record.expectedEntries = this.indexEntries(repo, expected); record.tree = this.git(repo, ['write-tree'], commit).toString().trim();
		record.hashes = Object.fromEntries(repo.allow.map(path => [path, digest(safePath(repo.cwd, path))])); record.state = 'prepared';
		this.write(`${prefix}.review.diff`, this.git(repo, ['diff', '--cached', '--binary', '--no-ext-diff', '--no-textconv'], commit)); this.persist();
		return { tree: record.tree, files: names, review: join(this.taskDir, `${prefix}.review.diff`) };
	}
	commit(repository: string, milestone: string, message: string, reviewedTree: string) {
		const repo = this.repo(repository), record = this.operation(repository, milestone), prefix = this.prefix(repository, milestone);
		invariant(record.state === 'prepared', 'Prepare/review or recover; never repeat a pending commit');
		invariant(record.tree === reviewedTree, 'Inspected tree token required'); invariant(/^[a-z]+(?:\([^\r\n)]+\))?!?: [^\r\n]+$/.test(message), 'Conventional Commit message required');
		this.verify(repo, record.baseline); this.verifyPrepared(repo, record);
		invariant(hash(readFileSync(safePath(this.taskDir, `${prefix}.task.patch`))) === record.patchHash, 'Task patch drift');
		invariant(this.git(repo, ['write-tree'], this.environment(`${prefix}-commit.index`)).toString().trim() === record.tree, 'Prepared index drift');
		record.message = message; record.state = 'intent'; this.persist();
		this.git(repo, ['commit', '-m', message], this.environment(`${prefix}-commit.index`));
		// Recovery intentionally requires no post-command receipt: intent + direct parent/tree/message identify success.
		return this.reconcile(repository, milestone);
	}
	private verifyPrepared(repo: Repository, record: Milestone) { for (const [path, expected] of Object.entries(record.hashes ?? {})) invariant(digest(safePath(repo.cwd, path)) === expected, `Prepared file drift: ${path}`); }
	reconcile(repository: string, milestone: string) {
		const repo = this.repo(repository), record = this.operation(repository, milestone), prefix = this.prefix(repository, milestone);
		invariant(record.state === 'intent' || record.state === 'reconciled', 'No pending/successful commit intent');
		const head = this.git(repo, ['rev-parse', 'HEAD']).toString().trim();
		if (head === record.baseline.head) {
			invariant(record.state === 'intent', 'Previously recorded commit disappeared; reconcile manually');
			this.verify(repo, record.baseline); this.verifyPrepared(repo, record);
			for (const marker of ['index.lock', 'HEAD.lock']) invariant(!existsSync(resolve(repo.cwd, this.git(repo, ['rev-parse', '--git-path', marker]).toString().trim())), 'Git operation still active');
			record.state = 'prepared'; this.persist(); return { repository, milestone, state: record.state, commit: undefined, observation: 'No commit at the expected branch; inspect failure and review again before retry' };
		}
		invariant(this.git(repo, ['rev-parse', 'HEAD^']).toString().trim() === record.baseline.head && this.git(repo, ['rev-parse', 'HEAD^{tree}']).toString().trim() === record.tree && this.git(repo, ['log', '-1', '--format=%B']).toString().trim() === record.message, 'Unknown commit; cannot reconcile');
		const entries = this.indexEntries(repo);
		invariant(entries === record.baseline.entries || entries === record.expectedEntries, 'Concurrent staging detected');
		this.verify(repo, record.baseline, head, entries); this.verifyPrepared(repo, record);
		if (entries !== record.expectedEntries) {
			const patch = readFileSync(safePath(this.taskDir, `${prefix}.task.patch`));
			invariant(hash(patch) === record.patchHash, 'Task patch drift');
			this.git(repo, ['apply', '--cached', '--check', '--whitespace=nowarn'], {}, patch); this.git(repo, ['apply', '--cached', '--whitespace=nowarn'], {}, patch);
		}
		invariant(this.indexEntries(repo) === record.expectedEntries, 'Index reconciliation mismatch');
		record.commit = head; record.state = 'reconciled'; this.persist(); return { repository, milestone, commit: head, state: record.state };
	}
	recover() {
		invariant(this.manifest, 'No task manifest');
		return { initialized: this.manifest.initialized, branches: this.config.repositories.map(repo => ({ repository: repo.id, branch: this.git(repo, ['branch', '--show-current']).toString().trim(), head: this.git(repo, ['rev-parse', 'HEAD']).toString().trim(), index: hash(this.git(repo, ['ls-files', '--stage', '-z'])) })), milestones: Object.fromEntries(Object.entries(this.manifest.milestones).map(([id, operations]) => [id, Object.fromEntries(Object.entries(operations).map(([name, record]) => [name, { state: record.state, baseHead: record.baseline.head, tree: record.tree, commit: record.commit }]))])), saves: this.manifest.saves };
	}
	checkpoint(path: string, content: string) {
		invariant(path === 'progress.md' || /^agents\/[a-zA-Z0-9_-]+\.md$/.test(path), 'Only assigned checkpoint paths'); this.write(path, content); return { path: join(this.taskDir, path) };
	}
	save(kind: 'plan' | 'report', payloadPath: string) {
		invariant(kind === 'plan' || kind === 'report', 'Unknown save kind'); invariant(!this.manifest.saves[kind], 'Save already attempted; reconcile receipt, never blindly retry');
		const payload = JSON.parse(readFileSync(payloadPath, 'utf8'));
		invariant(payload.source === 'conclusions' && payload.hash === null && typeof payload.path === 'string' && new RegExp(`^workspace/\\d{4}-\\d{2}-\\d{2}-${this.config.taskId}-${kind}\\.md$`).test(payload.path), 'Create-only task-specific conclusion payload required');
		invariant(typeof payload.title === 'string' && typeof payload.content === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(payload.approvedAt) && Array.isArray(payload.tags), 'Missing conclusion metadata');
		this.write(`${kind}-payload.json`, JSON.stringify(payload, null, '\t'));
		this.manifest.saves[kind] = { state: 'intent', payload: `${kind}-payload.json` }; this.persist();
		try {
			const result = this.runner(this.config.workspace, ['bun', 'run', '--cwd', 'command-center', 'cc', '--', 'save', `@${join(this.taskDir, `${kind}-payload.json`)}`]);
			const output = result.stdout.toString(); this.write(`${kind}-response.json`, JSON.stringify({ code: result.code, stdout: output, stderr: result.stderr.toString() }));
			// A zero exit without a structured receipt is ambiguous, not proof of persistence.
			let receipt: unknown; try { receipt = JSON.parse(output); } catch { /* retained below */ }
			const value = receipt as Record<string, unknown> | undefined;
			invariant(result.code === 0 && value?.source === 'conclusions' && value.path === payload.path && typeof value.hash === 'string' && /^[a-f0-9]{64}$/i.test(value.hash) && typeof value.id === 'string' && /^[a-f0-9-]{36}$/i.test(value.id), 'Save failed or receipt ambiguous; retain payload and reconcile without retry');
			this.manifest.saves[kind] = { state: 'saved', payload: `${kind}-payload.json`, receipt: `${kind}-response.json` }; this.persist(); return { path: value.path, id: value.id, hash: value.hash };
		} catch (error) {
			this.manifest.saves[kind] = { state: 'uncertain', payload: `${kind}-payload.json`, result: String(error) }; this.persist(); throw error;
		}
	}
	/** Reconcile only an already captured local CLI response, never read Command Center or retry a save. */
	recoverSave(kind: 'plan' | 'report') {
		const save = this.manifest.saves[kind]; invariant(save, 'No save intent');
		const responsePath = safePath(this.taskDir, `${kind}-response.json`); invariant(existsSync(responsePath), 'No local response; outcome uncertain, retain payload');
		const response = JSON.parse(readFileSync(responsePath, 'utf8'));
		const payload = JSON.parse(readFileSync(safePath(this.taskDir, save.payload), 'utf8'));
		const receipt = JSON.parse(response.stdout);
		invariant(response.code === 0 && receipt?.source === 'conclusions' && receipt.path === payload.path && typeof receipt.hash === 'string' && /^[a-f0-9]{64}$/i.test(receipt.hash) && typeof receipt.id === 'string' && /^[a-f0-9-]{36}$/i.test(receipt.id), 'No valid captured receipt; do not retry blindly');
		this.manifest.saves[kind] = { state: 'saved', payload: save.payload, receipt: `${kind}-response.json` }; this.persist(); return { path: receipt.path, id: receipt.id, hash: receipt.hash };
	}
	finalize(summaryDelivered: boolean) {
		invariant(this.manifest.initialized, 'Initialization incomplete');
		for (const [id, operations] of Object.entries(this.manifest.milestones)) {
			const records = Object.values(operations); invariant(records.every(record => record.state === 'reconciled'), 'Commit pending');
			const latest = records.at(-1); if (latest) { this.verify(this.repo(id), latest.baseline, latest.commit!, latest.expectedEntries!); this.verifyPrepared(this.repo(id), latest); }
		}
		for (const repo of this.config.repositories.filter(repo => !Object.keys(this.manifest.milestones[repo.id] ?? {}).length)) {
			const baseline = this.manifest.initial[repo.id]!;
			this.verify(repo, { ...baseline, branch: repo.product && this.config.branch ? this.config.branch : baseline.branch });
			for (const [path, original] of Object.entries(baseline.originals)) invariant(digest(safePath(repo.cwd, path)) === (original === null ? null : hash(Buffer.from(original, 'base64'))), `Uncommitted owned work: ${path}`);
		}
		invariant(this.manifest.saves.plan?.state === 'saved' && this.manifest.saves.report?.state === 'saved', 'Plan/report receipts pending');
		invariant(summaryDelivered, 'Deliver completion summary first'); this.manifest.final = { verified: true, summaryDelivered }; this.persist(); return { cleanupEligible: true };
	}
	cleanup() {
		invariant(this.manifest.final?.verified && this.manifest.final.summaryDelivered, 'Finalization pending');
		this.finalize(true);
		invariant(realpathSync(this.taskDir) === this.taskDir && relative(realpathSync(join(this.config.workspace, '.codex/crew-runs')), this.taskDir) === this.config.taskId, 'Task cleanup containment failed');
		const known = new Set(this.manifest.files), files: string[] = [], directories: string[] = [];
		const walk = (directory: string) => { for (const entry of readdirSync(directory, { withFileTypes: true })) { const target = join(directory, entry.name), path = relative(this.taskDir, target).split(sep).join('/'); safePath(this.taskDir, path); if (entry.isDirectory()) { walk(target); directories.push(target); } else { invariant(entry.isFile() && known.has(path), `Unregistered task file; retain: ${path}`); files.push(target); } } };
		walk(this.taskDir); for (const path of files) if (!path.endsWith(`${sep}manifest.json`)) unlinkSync(path);
		for (const directory of directories) rmdirSync(directory); unlinkSync(join(this.taskDir, 'manifest.json')); rmdirSync(this.taskDir);
		return { removed: this.taskDir };
	}
}

if (import.meta.main) {
	try {
		const [command, configuration, ...args] = process.argv.slice(2);
		invariant(configuration, 'Usage: bun crew.ts <init|begin|prepare|commit|recover|checkpoint|save|finalize|cleanup> <config.json> [arguments]');
		const crew = new Crew(JSON.parse(readFileSync(configuration, 'utf8')));
		const result = crew.withLock(() => { let output: unknown; switch (command) {
			case 'init': output = crew.init(); break;
			case 'begin': output = crew.begin(args[0]!, args[1]!); break;
			case 'prepare': output = crew.prepare(args[0]!, args[1]!); break;
			case 'commit': output = crew.commit(args[0]!, args[1]!, args[2]!, args[3]!); break;
			case 'recover': output = args[0] === '--save' ? crew.recoverSave(args[1] as 'plan' | 'report') : args.length ? crew.reconcile(args[0]!, args[1]!) : crew.recover(); break;
			case 'checkpoint': output = crew.checkpoint(args[0]!, readFileSync(args[1]!, 'utf8')); break;
			case 'save': output = crew.save(args[0] as 'plan' | 'report', args[1]!); break;
			case 'finalize': output = crew.finalize(args[0] === '--summary-delivered'); break;
			case 'cleanup': output = crew.cleanup(); break;
			default: throw new Error('Unknown command');
		} return output; });
		console.log(JSON.stringify(result));
	} catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; }
}
