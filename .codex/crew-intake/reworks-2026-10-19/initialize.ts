import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const workspace = 'D:/Planicam/planicam-workspace';
const intake = join(workspace, '.codex/crew-intake/reworks-2026-10-19');
function files(root: string, paths: string[]): string[] {
	const results: string[] = [];
	for (const path of paths) {
		const visit = (absolute: string) => {
			for (const entry of readdirSync(absolute, { withFileTypes: true })) {
				const target = join(absolute, entry.name);
				if (entry.isDirectory()) visit(target);
				else if (entry.isFile()) results.push(relative(root, target).replaceAll('\\', '/'));
			}
		};
		visit(join(root, path));
	}
	return results;
}
const frontend = 'D:/Planicam/planicam-frontend';
const backend = 'D:/Planicam/planicam-backend';
const config = {
	taskId: 'cycle1-reworks-20261019',
	workspace,
	// Explicit user exception: retain current branches and leave all edits uncommitted.
	repositories: [
		{ id: 'backend', cwd: backend, product: true, allow: [...new Set([
			...files(backend, ['src/modules/printouts', 'src/modules/positions', 'prisma/seeds']),
			'prisma/models/printouts.prisma', 'prisma/seed.ts', 'package.json', 'bun.lock',
			'docs/ai/hub-api.md', 'docs/ai/data-model-contracts.md', 'docs/ai/domain-workflows.md',
			'docs/ai/provisioning.md', 'docs/ai/project-map.md', 'test/hub.e2e-spec.ts',
			'.changeset/cycle1-reworks.md',
		])] },
		{ id: 'frontend', cwd: frontend, product: true, allow: [...new Set([
			...files(frontend, ['apps/planicam-web/src', 'libs/shared/ui', 'libs/hub', 'libs/project-management', 'libs/fabrication', 'libs/contacts', 'libs/position-editor', 'libs/calc/temporary-engine']),
			'package.json', 'bun.lock', 'tsconfig.base.json', 'docs/architecture/frontend-architecture.md',
			'docs/development/state-management.md', '.changeset/cycle1-reworks.md',
		])] },
	],
};
const configPath = join(intake, 'crew.config.json');
writeFileSync(configPath, JSON.stringify(config, null, '\t') + '\n');
const result = Bun.spawnSync(['bun', '.agents/skills/redhat-crew/scripts/crew.ts', 'init', configPath], { cwd: workspace, stdout: 'pipe', stderr: 'pipe' });
process.stdout.write(result.stdout);
process.stderr.write(result.stderr);
if (result.exitCode !== 0) process.exit(result.exitCode);
const payload = {
	source: 'conclusions', path: 'workspace/2026-10-19-cycle1-reworks-20261019-plan.md',
	title: 'Cycle 1 Reworks — approved implementation plan', approvedAt: '2026-10-19',
	tags: ['redhat-crew', 'approved-plan', 'cycle1-reworks'],
	content: readFileSync(join(intake, 'plan.md'), 'utf8'), hash: null,
};
writeFileSync(join(intake, 'approved-plan-payload.json'), JSON.stringify(payload, null, '\t') + '\n');
