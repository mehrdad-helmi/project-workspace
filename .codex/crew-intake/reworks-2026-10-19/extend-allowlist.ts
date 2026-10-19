import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

const base = 'D:/Planicam/planicam-workspace';
const intake = join(base, '.codex/crew-intake/reworks-2026-10-19');
const run = join(base, '.codex/crew-runs/cycle1-reworks-20261019');
const configPath = join(intake, 'crew.config.json');
const config = JSON.parse(readFileSync(configPath, 'utf8'));
const manifestPath = join(run, 'manifest.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const request = JSON.parse(readFileSync(process.argv[2]!, 'utf8')) as Record<string, string[]>;
const hash = (content: Buffer) => createHash('sha256').update(content).digest('hex');
const journal: unknown[] = [];
for (const [id, paths] of Object.entries(request)) {
	const repo = config.repositories.find((entry: { id: string }) => entry.id === id);
	if (!repo) throw new Error(`Unknown repo ${id}`);
	const initial = manifest.initial[id];
	const index = Bun.spawnSync(['git', 'ls-files', '--stage', '-z'], { cwd: repo.cwd, stdout: 'pipe' });
	if (index.exitCode !== 0 || index.stdout.toString('base64') !== initial.entries) throw new Error(`Index drift ${id}`);
	for (const path of paths) {
		if (path.startsWith('/') || path.includes('..') || path.includes('\\')) throw new Error(`Unsafe path ${path}`);
		if (repo.allow.includes(path)) continue;
		const target = join(repo.cwd, path);
		let original: string | null = null;
		if (existsSync(target)) {
			let contents = readFileSync(target);
			if (Object.hasOwn(initial.dirty, path)) {
				if (hash(contents) !== initial.dirty[path]) {
					const entry = Buffer.from(initial.entries, 'base64').toString().split('\0').find((row) => row.endsWith(`\t${path}`));
					const blob = entry?.split(' ')[1];
					if (!blob) throw new Error(`No initial staged original ${id}:${path}`);
					const recovered = Bun.spawnSync(['git', 'cat-file', 'blob', blob], { cwd: repo.cwd, stdout: 'pipe', stderr: 'pipe' });
					if (recovered.exitCode !== 0) throw new Error(`Cannot read initial original ${id}:${path}`);
					const candidates = [recovered.stdout, Buffer.from(recovered.stdout.toString().replace(/\r?\n/gu, '\r\n'))];
					const exact = candidates.find((candidate) => hash(candidate) === initial.dirty[path]);
					if (!exact) throw new Error(`Cannot prove initial original ${id}:${path}`);
					contents = exact;
					journal.push({ repository: id, path, recovery: 'preserved-initial-index-blob-matches-initial-working-hash', at: new Date().toISOString() });
				}
			} else {
				const head = Bun.spawnSync(['git', 'show', `${initial.head}:${path}`], { cwd: repo.cwd, stdout: 'pipe', stderr: 'pipe' });
				if (head.exitCode !== 0 || !contents.equals(head.stdout)) throw new Error(`No unchanged initial proof ${id}:${path}`);
			}
			original = contents.toString('base64');
		}
		initial.originals[path] = original;
		repo.allow.push(path);
		journal.push({ repository: id, path, original: original === null ? 'absent' : 'captured', at: new Date().toISOString() });
	}
	manifest.config.repositories.find((entry: { id: string }) => entry.id === id).allow = repo.allow;
	writeFileSync(join(run, `initial-${id}.baseline.json`), JSON.stringify(initial, null, '\t') + '\n');
}
writeFileSync(configPath, JSON.stringify(config, null, '\t') + '\n');
writeFileSync(manifestPath, JSON.stringify(manifest, null, '\t') + '\n');
const journalPath = join(intake, 'allowlist-reconciliations.json');
const previous = existsSync(journalPath) ? JSON.parse(readFileSync(journalPath, 'utf8')) : [];
writeFileSync(journalPath, JSON.stringify([...previous, ...journal], null, '\t') + '\n');
console.log(JSON.stringify({ added: journal.length }));
