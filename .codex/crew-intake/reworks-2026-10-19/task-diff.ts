import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const workspace = 'D:/Planicam/planicam-workspace';
const intake = join(workspace, '.codex/crew-intake/reworks-2026-10-19');
const manifest = JSON.parse(readFileSync(join(workspace, '.codex/crew-runs/cycle1-reworks-20261019/manifest.json'), 'utf8'));
const evidence = join(intake, 'evidence');
mkdirSync(evidence, { recursive: true });
const hash = (value: Buffer) => createHash('sha256').update(value).digest('hex');
for (const repo of manifest.config.repositories) {
	if (process.argv[2] && repo.id !== process.argv[2]) continue;
	const initial = manifest.initial[repo.id];
	const changes: { path: string; baseline: string | null; current: string | null }[] = [];
	const patches: string[] = [];
	for (const path of repo.allow as string[]) {
		const original = initial.originals[path] === null ? null : Buffer.from(initial.originals[path], 'base64');
		const currentPath = join(repo.cwd, path);
		const current = existsSync(currentPath) ? readFileSync(currentPath) : null;
		if (original === null && current === null || original !== null && current !== null && original.equals(current)) continue;
		changes.push({ path, baseline: original === null ? null : hash(original), current: current === null ? null : hash(current) });
		const oldPath = join(evidence, 'originals', repo.id, path);
		mkdirSync(dirname(oldPath), { recursive: true });
		writeFileSync(oldPath, original ?? Buffer.alloc(0));
		const newPath = current === null ? join(evidence, 'empty-current') : currentPath;
		if (current === null) writeFileSync(newPath, Buffer.alloc(0));
		const diff = Bun.spawnSync(['git', 'diff', '--no-index', '--no-ext-diff', '--', oldPath, newPath], { stdout: 'pipe', stderr: 'pipe' });
		if (diff.exitCode !== 0 && diff.exitCode !== 1) throw new Error(diff.stderr.toString());
		patches.push(`\n# Task path ${repo.id}:${path}\n${diff.stdout.toString()}`);
	}
	const actualPaths = new Set<string>();
	for (const args of [['diff', '--name-only', '-z'], ['ls-files', '--others', '--exclude-standard', '-z']]) {
		const result = Bun.spawnSync(['git', ...args], { cwd: repo.cwd, stdout: 'pipe' });
		for (const path of result.stdout.toString().split('\0').filter(Boolean)) actualPaths.add(path);
	}
	const outside = [...actualPaths].filter((path) => {
		if (repo.allow.includes(path)) return false;
		const target = join(repo.cwd, path);
		const digest = existsSync(target) ? hash(readFileSync(target)) : null;
		return digest !== initial.dirty[path];
	});
	writeFileSync(join(evidence, `${repo.id}-changes.json`), JSON.stringify({ changes, outside }, null, '\t') + '\n');
	writeFileSync(join(evidence, `${repo.id}-task.patch`), patches.join(''));
	console.log(JSON.stringify({ repository: repo.id, changes: changes.length, outside, patch: join(evidence, `${repo.id}-task.patch`) }));
}
