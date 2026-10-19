import { describe, expect, test, setDefaultTimeout } from 'bun:test';
import { mkdtempSync, mkdirSync, readFileSync, symlinkSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Crew, type Configuration, type Runner, type Result } from './crew';

setDefaultTimeout(60000);

const run: Runner = (cwd, args, env = {}, input) => {
	const result = Bun.spawnSync(args, { cwd, env: { ...process.env, ...env }, stdin: input, stdout: 'pipe', stderr: 'pipe' });
	return { code: result.exitCode, stdout: result.stdout, stderr: result.stderr };
};
function git(cwd: string, ...args: string[]) { const result = run(cwd, ['git', ...args]); if (result.code) throw new Error(result.stderr.toString()); return result.stdout.toString().trim(); }
function setup(branch?: string) {
	const root = mkdtempSync(join(tmpdir(), 'crew-helper-'));
	const repositories = ['workspace', 'backend', 'frontend'].map(id => {
		const cwd = join(root, id); mkdirSync(cwd); git(cwd, 'init', '-b', 'original'); git(cwd, 'config', 'user.name', 'Crew Test'); git(cwd, 'config', 'user.email', 'crew@example.invalid'); git(cwd, 'config', 'core.autocrlf', 'false');
		const content = Array.from({ length: 50 }, (_, index) => `line ${index}`).join('\n') + '\n';
		writeFileSync(join(cwd, '.gitignore'), '.codex/\n'); writeFileSync(join(cwd, 'shared.md'), content); writeFileSync(join(cwd, 'staged.md'), 'original\n'); writeFileSync(join(cwd, 'unstaged.md'), 'original\n');
		git(cwd, 'add', '.'); git(cwd, 'commit', '-m', 'chore: fixture');
		writeFileSync(join(cwd, 'shared.md'), content.replace('line 1\n', 'staged user\n')); writeFileSync(join(cwd, 'staged.md'), 'staged user\n'); git(cwd, 'add', 'shared.md', 'staged.md');
		writeFileSync(join(cwd, 'shared.md'), readFileSync(join(cwd, 'shared.md'), 'utf8').replace('line 48\n', 'unstaged user\n')); writeFileSync(join(cwd, 'unstaged.md'), 'unstaged user\n'); writeFileSync(join(cwd, 'untracked.md'), 'untracked user\n');
		return { id, cwd, allow: ['shared.md', '.changeset/crew.md'], product: id !== 'workspace' };
	});
	const config: Configuration = { taskId: 'example', workspace: repositories[0]!.cwd, repositories, ...(branch ? { branch } : {}) };
	return { config, repo: repositories[1]!, root };
}
function edit(cwd: string, previous = 'line 25', next = 'crew change') { writeFileSync(join(cwd, 'shared.md'), readFileSync(join(cwd, 'shared.md'), 'utf8').replace(previous, next)); }
function successfulSave(args: string[]): Result {
	const saved = JSON.parse(readFileSync(args.at(-1)!.slice(1), 'utf8'));
	return { code: 0, stdout: Buffer.from(JSON.stringify({ ...saved, id: '00000000-0000-0000-0000-000000000001', hash: 'a'.repeat(64) })), stderr: Buffer.alloc(0) };
}
function payload(root: string, kind: 'plan' | 'report') {
	const path = join(root, `${kind}.json`); writeFileSync(path, JSON.stringify({ source: 'conclusions', path: `workspace/2026-10-19-example-${kind}.md`, title: kind, approvedAt: '2026-10-19', tags: ['crew'], content: kind, hash: null })); return path;
}

describe('task-only Git milestones', () => {
	test('preserves mixed staging and shared-file hunks through interrupted commit and repeated milestones', () => {
		const { config, repo } = setup(); let interrupt = true;
		const runner: Runner = (...args) => {
			const result = run(...args);
			if (interrupt && args[1].includes('commit') && result.code === 0) { interrupt = false; throw new Error('terminated immediately after git success, before receipt'); }
			return result;
		};
		let crew = new Crew(config, runner); crew.withLock(() => crew.init()); crew.begin('backend', 'first'); edit(repo.cwd);
		const prepared = crew.prepare('backend', 'first');
		expect(() => crew.commit('backend', 'first', 'docs: crew', 'unreviewed')).toThrow('Inspected tree');
		expect(() => crew.commit('backend', 'first', 'docs: crew', prepared.tree!)).toThrow('terminated');
		const first = git(repo.cwd, 'rev-parse', 'HEAD');
		crew = new Crew(config); expect(() => crew.commit('backend', 'first', 'docs: duplicate', prepared.tree!)).toThrow('never repeat');
		crew.reconcile('backend', 'first'); crew.reconcile('backend', 'first'); expect(git(repo.cwd, 'rev-parse', 'HEAD')).toBe(first);
		expect(git(repo.cwd, 'show', 'HEAD:shared.md')).toContain('crew change'); expect(git(repo.cwd, 'show', 'HEAD:shared.md')).toContain('line 1\n'); expect(git(repo.cwd, 'show', 'HEAD:shared.md')).toContain('line 48');
		expect(git(repo.cwd, 'show', ':shared.md')).toContain('staged user'); expect(git(repo.cwd, 'show', ':shared.md')).toContain('line 48'); expect(readFileSync(join(repo.cwd, 'shared.md'), 'utf8')).toContain('unstaged user');
		crew.begin('backend', 'second'); edit(repo.cwd, 'crew change', 'crew next'); mkdirSync(join(repo.cwd, '.changeset')); writeFileSync(join(repo.cwd, '.changeset/crew.md'), '---\n---\n\n**Crew instructions**\n\nUpdate crew guidance.\n');
		const second = crew.prepare('backend', 'second'); crew.commit('backend', 'second', 'docs: second milestone', second.tree!);
		expect(git(repo.cwd, 'rev-parse', 'HEAD^')).toBe(first); expect(git(repo.cwd, 'show', 'HEAD:shared.md')).toContain('crew next');
		expect(git(repo.cwd, 'diff', '--cached', '--name-only').split('\n').sort()).toEqual(['shared.md', 'staged.md']);
		expect(git(repo.cwd, 'diff', '--name-only').split('\n').sort()).toEqual(['shared.md', 'unstaged.md']); expect(readFileSync(join(repo.cwd, 'untracked.md'), 'utf8')).toBe('untracked user\n');
	});
	test('rejects changed owned files, index, HEAD, and unrelated files', () => {
		const { config, repo } = setup(); const crew = new Crew(config); crew.init(); crew.begin('backend', 'one'); edit(repo.cwd); const prepared = crew.prepare('backend', 'one');
		edit(repo.cwd, 'crew change', 'racing edit'); expect(() => crew.commit('backend', 'one', 'docs: crew', prepared.tree!)).toThrow('Prepared file drift');
		edit(repo.cwd, 'racing edit', 'crew change'); git(repo.cwd, 'add', 'untracked.md'); expect(() => crew.commit('backend', 'one', 'docs: crew', prepared.tree!)).toThrow('Staging drift');
		const other = setup(); const c = new Crew(other.config); c.init(); c.begin('backend', 'one'); edit(other.repo.cwd); c.prepare('backend', 'one'); writeFileSync(join(other.repo.cwd, 'unstaged.md'), 'concurrent unrelated'); expect(() => c.prepare('backend', 'one')).toThrow('Unrelated work drift');
		git(other.repo.cwd, 'branch', 'other'); git(other.repo.cwd, 'switch', 'other'); expect(() => c.prepare('backend', 'one')).toThrow('Branch/HEAD drift');
	});
	test('rejects drift before a new baseline and safely recovers a failed commit without success', () => {
		const { config, repo } = setup(); let rejectCommit = true;
		const runner: Runner = (...args) => { if (rejectCommit && args[1].includes('commit')) { rejectCommit = false; return { code: 1, stdout: Buffer.alloc(0), stderr: Buffer.from('fixture verification hook rejected commit') }; } return run(...args); };
		const crew = new Crew(config, runner); crew.init();
		git(repo.cwd, 'branch', 'external'); git(repo.cwd, 'switch', 'external'); expect(() => crew.begin('backend', 'one')).toThrow('Branch/HEAD drift'); git(repo.cwd, 'switch', 'original');
		crew.begin('backend', 'one'); edit(repo.cwd); let prepared = crew.prepare('backend', 'one'); expect(() => crew.commit('backend', 'one', 'docs: crew', prepared.tree!)).toThrow('hook rejected');
		expect(crew.reconcile('backend', 'one').state).toBe('prepared'); prepared = crew.prepare('backend', 'one'); crew.commit('backend', 'one', 'docs: crew', prepared.tree!);
		expect(git(repo.cwd, 'rev-list', '--count', 'HEAD')).toBe('2');
	});
});

describe('matching branch initialization and checkpoints', () => {
	test('preflights collisions in both products before changing either branch', () => {
		const { config } = setup('cycle/collision'); git(config.repositories[2]!.cwd, 'branch', config.branch!); const crew = new Crew(config);
		expect(() => crew.init()).toThrow('Branch collision'); for (const repo of config.repositories) expect(git(repo.cwd, 'branch', '--show-current')).toBe('original'); expect(() => crew.begin('backend', 'one')).toThrow('Initialize both');
	});
	test('recovers partial initialization even before successful switch receipt and preserves dirty state', () => {
		const { config } = setup('cycle/resume'); let fail = true;
		const runner: Runner = (...args) => { const result = run(...args); if (fail && args[1].includes('switch') && result.code === 0) { fail = false; throw new Error('interrupted switch'); } return result; };
		const crew = new Crew(config, runner); expect(() => crew.init()).toThrow('interrupted'); expect(() => crew.begin('frontend', 'one')).toThrow('Initialize both');
		const resumed = new Crew(config); resumed.init(); resumed.init();
		resumed.withLock(() => expect(() => new Crew(config).withLock(() => null)).toThrow('active'));
		for (const repo of config.repositories.filter(repo => repo.product)) { expect(git(repo.cwd, 'branch', '--show-current')).toBe('cycle/resume'); expect(git(repo.cwd, 'status', '--porcelain')).toContain('MM shared.md'); }
		resumed.checkpoint('agents/frontend.md', 'Responsibility: form\nGrounding: libs/shared/ui\nNext: implement\n');
		expect(readFileSync(join(resumed.taskDir, 'agents/frontend.md'), 'utf8')).toContain('Grounding'); expect(() => resumed.checkpoint('../elsewhere.md', 'bad')).toThrow('Only assigned');
	});
});

describe('save receipts and cleanup', () => {
	test('retains failed payload, blocks blind retry, and refuses cleanup', () => {
		const { config, root } = setup(); let saves = 0;
		const runner: Runner = (...args) => { if (args[1][0] === 'bun') { saves++; return { code: 1, stdout: Buffer.alloc(0), stderr: Buffer.from('host unavailable') }; } return run(...args); };
		const crew = new Crew(config, runner); crew.init(); expect(() => crew.save('report', payload(root, 'report'))).toThrow('Save failed'); expect(existsSync(join(crew.taskDir, 'report-payload.json'))).toBe(true);
		expect(() => crew.save('report', payload(root, 'report'))).toThrow('already attempted'); expect(saves).toBe(1); expect(() => crew.finalize(true)).toThrow('receipts pending'); expect(() => crew.cleanup()).toThrow('Finalization pending');
	});
	test('accepts structured saves only, finalizes, and removes only registered files', () => {
		const { config, root } = setup(); const calls: string[][] = [];
		const runner: Runner = (...args) => { if (args[1][0] === 'bun') { calls.push(args[1]); return successfulSave(args[1]); } return run(...args); };
		const crew = new Crew(config, runner); crew.init(); crew.checkpoint('progress.md', 'done'); crew.save('plan', payload(root, 'plan')); crew.save('report', payload(root, 'report'));
		// Simulate process loss after durable stdout capture but before recording the saved state.
		const manifestPath = join(crew.taskDir, 'manifest.json'); const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')); manifest.saves.report.state = 'intent'; delete manifest.saves.report.receipt; writeFileSync(manifestPath, JSON.stringify(manifest));
		const recovered = new Crew(config, runner); expect(recovered.recoverSave('report').path).toBe('workspace/2026-10-19-example-report.md'); expect(calls.length).toBe(2);
		expect(calls.every(args => args.join(' ').startsWith('bun run --cwd command-center cc -- save @'))).toBe(true); expect(() => crew.finalize(false)).toThrow('summary'); crew.finalize(true);
		writeFileSync(join(crew.taskDir, 'unknown.txt'), 'retain'); expect(() => crew.cleanup()).toThrow('Unregistered task file'); expect(existsSync(join(crew.taskDir, 'manifest.json'))).toBe(true);
	});
	test('successful cleanup preserves sibling tasks and refuses symlink traversal', () => {
		const { config, root } = setup(); const runner: Runner = (...args) => args[1][0] === 'bun' ? successfulSave(args[1]) : run(...args);
		const crew = new Crew(config, runner); crew.init(); crew.save('plan', payload(root, 'plan')); crew.save('report', payload(root, 'report')); crew.finalize(true);
		const sibling = join(config.workspace, '.codex/crew-runs/sibling'); mkdirSync(sibling); writeFileSync(join(sibling, 'keep.md'), 'keep'); crew.withLock(() => crew.cleanup()); expect(existsSync(crew.taskDir)).toBe(false); expect(readFileSync(join(sibling, 'keep.md'), 'utf8')).toBe('keep');
		const second = setup(); const bad = new Crew(second.config); bad.init(); const external = join(second.root, 'external'); mkdirSync(external); symlinkSync(external, join(bad.taskDir, 'agents'), 'junction'); expect(() => bad.checkpoint('agents/a.md', 'unsafe')).toThrow('Symlink');
	});
});
