import { existsSync, lstatSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const run = 'D:/Planicam/planicam-workspace/.codex/crew-runs/cycle1-reworks-20261019';
const path = join(run, 'manifest.json');
const manifest = JSON.parse(readFileSync(path, 'utf8'));
const artifacts = [
	'agents/frontend-browser-fixture.ts',
	'agents/frontend-printout-review.png',
	'agents/frontend-printout-options.png',
	'agents/frontend-position-dialog.png',
	'agents/frontend-runtime-evidence.json',
	'agents/frontend-position-reference.png',
	'agents/frontend-position-context.json',
];
for (const artifact of artifacts) {
	const target = join(run, artifact);
	if (existsSync(target) && (!lstatSync(target).isFile() || lstatSync(target).isSymbolicLink())) throw new Error(`Invalid task artifact ${artifact}`);
	for (const registered of [artifact, `${artifact}.tmp`]) if (!manifest.files.includes(registered)) manifest.files.push(registered);
}
writeFileSync(path, JSON.stringify(manifest, null, '\t') + '\n');
console.log(JSON.stringify({ registered: artifacts.length }));
