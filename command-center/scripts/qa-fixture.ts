import { join } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { config } from '../config';
import { createApp } from '../server/app';
import { contentHash } from '../server/files';
import { localDate, addDays } from '../shared/contracts';

if (!config.dataRoot.includes('qa-data'))
	throw new Error('QA fixtures require CC_DATA_DIR pointing to an isolated qa-data directory.');
const { store, files } = await createApp(config);
if (store.board().workstreams.length) {
	console.log('QA data already exists.');
	store.db.close();
	process.exit(0);
}
store.setSetting('passwordHash', await Bun.password.hash('qa-only-password'));
const token = crypto.randomUUID() + crypto.randomUUID();
store.setSetting('agentTokenHash', contentHash(token));
await writeFile(join(config.dataRoot, 'agent-token'), token);
for (const [title, tasks] of [
	[
		'Engineering foundations',
		[
			'Review catalog version boundaries',
			'Define canonical position inputs',
			'Confirm derived output contract',
		],
	],
	[
		'Frontend delivery',
		[
			'Connect the signup completion flow',
			'Review position editor interactions',
			'Polish the shared form controls',
		],
	],
	['Cloud infrastructure', ['Review tenant isolation rules', 'Document session lifecycle']],
] as [string, string[]][]) {
	const stream = store.createWorkstream(`[Demo] ${title}`, 'Isolated QA fixture');
	const sections = store.board().sections.filter((section) => section.workstreamId === stream.id);
	tasks.forEach((title, index) =>
		store.createTask({
			title,
			description:
				'Review the current implementation and record the agreed next step in the workspace documentation.',
			tags: index === 0 ? ['architecture', 'review'] : ['v1'],
			links: ['/documents?source=workspace&path=docs/architecture/overview.md'],
			parentId: null,
			sectionId: sections[index % 3].id,
		}),
	);
}
await files.save({
	source: 'notes',
	path: 'Engineering/demo-note.md',
	title: '[Demo] Engineering notebook',
	content:
		'# Engineering notebook\n\nThis is isolated demo content for browser verification.\n\n| Boundary | Owner |\n| --- | --- |\n| Engineering truth | Planicore |\n| Interaction | Angular |\n\n```mermaid\nflowchart LR\n A[Angular] --> B[Planicore]\n A --> C[NestJS]\n```\n\n```vega-lite\n{"data":{"values":[{"label":"Open","value":5},{"label":"Done","value":3}]},"mark":"bar","encoding":{"x":{"field":"label","type":"nominal"},"y":{"field":"value","type":"quantitative"}}}\n```\n',
	hash: null,
});
await files.save({
	source: 'conclusions',
	path: 'demo-decision.md',
	title: '[Demo] Calculation ownership',
	approvedAt: localDate(),
	tags: ['architecture'],
	content:
		'# Calculation ownership\n\nDemo record for visual verification. The approved product architecture keeps engineering calculations in Planicore.\n',
	hash: null,
});
store.createEvent({
	date: localDate(),
	title: '[Demo] Architecture review',
	description: 'Review the shared input boundaries and record the next decisions.',
	color: 0,
});
store.createEvent({
	date: addDays(localDate(), 1),
	title: '[Demo] Frontend planning',
	description: 'Prepare the next implementation slice.',
	color: 2,
});
store.db.close();
console.log('Isolated QA fixtures prepared. Login password: qa-only-password');
