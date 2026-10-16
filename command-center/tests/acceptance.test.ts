import { afterEach, describe, expect, test } from 'bun:test';
import { Database } from 'bun:sqlite';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { zipSync, unzipSync, strToU8 } from 'fflate';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { config } from '../config';
import { createApp } from '../server/app';
import { Store } from '../server/database';
import { contentHash } from '../server/files';
import { exportBackup, restoreBackup } from '../server/backup';
import { SchemaReader } from '../server/schema';
import { formatCountdown } from '../shared/calendar';
import {
	addDays,
	dateSchema,
	eventInput,
	localDate,
	progress,
	type Section,
	type Task,
} from '../shared/contracts';

const fixtures: { root: string; store?: Store }[] = [];
function fixture() {
	const root = mkdtempSync(join(tmpdir(), 'planicam-cc-test-'));
	const dataRoot = join(root, 'data');
	const repositories = {
		workspace: join(root, 'workspace'),
		frontend: join(root, 'frontend'),
		backend: join(root, 'backend'),
	};
	Object.values(repositories).forEach((path) => mkdirSync(path));
	const entry = { root, store: undefined as Store | undefined };
	fixtures.push(entry);
	return { root, entry, appConfig: { ...config, dataRoot, repositories } };
}
afterEach(() => {
	for (const fixture of fixtures.splice(0)) {
		fixture.store?.db.close(true);
		rmSync(fixture.root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
	}
});
function boardFixture() {
	const f = fixture();
	const store = new Store(f.appConfig.dataRoot);
	f.entry.store = store;
	const stream = store.createJob('Engineering', '');
	const sections = store.board().sections.filter((item) => item.jobId === stream.id);
	const inbox = sections.find((item) => item.kind === 'inbox')!,
		done = sections.find((item) => item.kind === 'done')!,
		active = sections.find((item) => item.kind === 'active')!;
	const create = (title: string, parentId: string | null = null, sectionId = inbox.id) =>
		store.createTask({ title, parentId, sectionId, description: '', tags: [], links: [] });
	return { ...f, store, stream, inbox, done, active, create };
}

describe('task invariants and atomic writes', () => {
	test('blocks unfinished descendants; complete-all and reopening update ancestors', () => {
		const { store, create, done, active, stream } = boardFixture();
		const parent = create('Parent');
		const child = create('Child', parent.id);
		const grandchild = create('Grandchild', child.id);
		expect(() =>
			store.moveTask(parent.id, {
				revision: parent.revision,
				sectionId: done.id,
				completeAll: false,
			}),
		).toThrow('unfinished subtasks');
		expect(store.board().tasks.every((task) => task.revision === 1)).toBe(true);
		store.moveTask(parent.id, { revision: parent.revision, sectionId: done.id, completeAll: true });
		expect(progress(store.board(), stream.id)).toEqual({
			total: 3,
			completed: 3,
			remaining: 0,
			percent: 100,
		});
		const updated = store.board().tasks.find((task) => task.id === grandchild.id)!;
		store.moveTask(grandchild.id, {
			revision: updated.revision,
			sectionId: active.id,
			completeAll: false,
		});
		expect(store.board().tasks.every((task) => task.sectionId === active.id)).toBe(true);
		expect(progress(store.board(), stream.id).completed).toBe(0);
	});
	test('rejects stale revisions and cycles; blocked completion rolls field changes back', () => {
		const { store, create, done } = boardFixture();
		const parent = create('Parent');
		const child = create('Child', parent.id);
		expect(() => store.updateTask(parent.id, { revision: 1, parentId: child.id })).toThrow(
			'descendant',
		);
		expect(() =>
			store.updateTask(parent.id, { revision: 1, title: 'Changed', sectionId: done.id }),
		).toThrow('unfinished subtasks');
		expect(store.board().tasks.find((task) => task.id === parent.id)?.title).toBe('Parent');
		store.updateTask(child.id, { revision: 1, title: 'New title' });
		expect(() => store.updateTask(child.id, { revision: 1, title: 'Stale edit' })).toThrow(
			'changed',
		);
	});
	test('new unfinished descendants reopen Done parents; moves preserve subtree status', () => {
		const { store, create, done, inbox } = boardFixture();
		const parent = create('Parent', null, done.id);
		const child = create('Child', parent.id);
		expect(store.board().tasks.find((task) => task.id === parent.id)?.sectionId).not.toBe(done.id);
		store.moveTask(child.id, { revision: child.revision, sectionId: done.id, completeAll: false });
		const other = store.createJob('Other', '');
		const target = store
			.board()
			.sections.find((item) => item.jobId === other.id && item.kind === 'active')!;
		const current = store.board().tasks.find((item) => item.id === parent.id)!;
		store.moveTask(parent.id, {
			revision: current.revision,
			sectionId: target.id,
			completeAll: false,
		});
		const board = store.board();
		expect(board.tasks.every((task) => task.jobId === other.id)).toBe(true);
		expect(
			board.sections.find(
				(section) => section.id === board.tasks.find((task) => task.id === parent.id)!.sectionId,
			)?.kind,
		).toBe('inbox');
		expect(
			board.sections.find(
				(section) => section.id === board.tasks.find((task) => task.id === child.id)!.sectionId,
			)?.kind,
		).toBe('done');
	});
	test('recovery preserves subtree; builtin sections and nonempty sections are protected', () => {
		const { store, create, stream, done } = boardFixture();
		const parent = create('Parent');
		create('Child', parent.id);
		const deleted = store.delete('tasks', parent.id, parent.revision);
		expect(deleted.affected).toBe(2);
		expect(store.board().tasks).toHaveLength(0);
		store.restoreRecords(deleted.trashId);
		expect(store.board().tasks).toHaveLength(2);
		expect(() => store.delete('sections', done.id, done.revision)).toThrow('cannot be deleted');
		const custom = store.createSection(stream.id, 'Review');
		create('Review item', null, custom.id);
		expect(() => store.delete('sections', custom.id, custom.revision)).toThrow('Move all tasks');
	});
	test('card order is persisted and stale drop targets roll back', () => {
		const { store, create, inbox } = boardFixture();
		const a = create('A'),
			b = create('B');
		store.moveTask(b.id, { revision: 1, sectionId: inbox.id, beforeId: a.id, completeAll: false });
		expect(store.board().tasks.map((task) => task.title)).toEqual(['B', 'A']);
		const b2 = store.board().tasks.find((item) => item.id === b.id)!;
		expect(() =>
			store.moveTask(b.id, {
				revision: b2.revision,
				sectionId: inbox.id,
				beforeId: crypto.randomUUID(),
				completeAll: false,
			}),
		).toThrow('drop target');
	});
	test('only Done is fixed; deleted defaults are recreated when needed', () => {
		const { store, create, done, active, inbox } = boardFixture();
		const parent = create('Parent', null, done.id);
		const child = create('Child', parent.id, done.id);
		store.updateSection(inbox.id, inbox.revision, 'Backlog');
		expect(store.row<Section>('sections', inbox.id).title).toBe('Backlog');
		const removed = store.delete('sections', active.id, active.revision);
		store.moveTask(child.id, { revision: child.revision, sectionId: inbox.id, completeAll: false });
		expect(
			store
				.board()
				.sections.find((section) => section.id === store.row<Task>('tasks', parent.id).sectionId)
				?.kind,
		).toBe('active');
		store.restoreRecords(removed.trashId);
		expect(store.row<Section>('sections', active.id).kind).toBe('custom');
		const target = store.createJob('Target', '');
		const targetInbox = store
			.board()
			.sections.find((section) => section.jobId === target.id && section.kind === 'inbox')!;
		const targetDone = store
			.board()
			.sections.find((section) => section.jobId === target.id && section.kind === 'done')!;
		store.delete('sections', targetInbox.id, targetInbox.revision);
		store.moveTask(parent.id, {
			revision: store.row<Task>('tasks', parent.id).revision,
			sectionId: targetDone.id,
			completeAll: false,
		});
		expect(
			store
				.board()
				.sections.find((section) => section.id === store.row<Task>('tasks', parent.id).sectionId)
				?.kind,
		).toBe('inbox');
	});
});

describe('authenticated API and Markdown persistence', () => {
	async function appFixture() {
		const f = fixture();
		const built = await createApp(f.appConfig);
		f.entry.store = built.store;
		built.store.setSetting('agentTokenHash', contentHash('test-agent'));
		const request = (
			path: string,
			method = 'GET',
			body?: unknown,
			auth = true,
			extra: Record<string, string> = {},
		) =>
			built.app.fetch(
				new Request(`http://localhost:7200/api/v1/${path}`, {
					method,
					headers: {
						...(auth ? { Authorization: 'Bearer test-agent' } : {}),
						...(body ? { 'Content-Type': 'application/json' } : {}),
						...extra,
					},
					body: body === undefined ? undefined : JSON.stringify(body),
				}),
			);
		return { ...f, ...built, request };
	}
	test('denies unauthenticated requests, cross-origin writes, traversal and hidden files', async () => {
		const { request } = await appFixture();
		expect((await request('board', 'GET', undefined, false)).status).toBe(401);
		expect(
			(
				await request('jobs', 'POST', { title: 'Bad' }, true, {
					Origin: 'https://evil.example',
				})
			).status,
		).toBe(403);
		for (const path of ['../secret.md', 'C:/secret.md', '.env', 'node_modules/secret.md'])
			expect(
				(await request(`asset?source=workspace&path=${encodeURIComponent(path)}`)).status,
			).toBeGreaterThanOrEqual(400);
	});
	test('calendar API defaults new types, validates the enum and preserves omitted types on edit', async () => {
		const { request, store } = await appFixture();
		const input = { title: 'Milestone', description: '', date: '2028-02-29', color: 0 };
		const created = await request('events', 'POST', input);
		expect(created.status).toBe(201);
		const event = await created.json();
		expect(event.type).toBe('SIMPLE');
		const update = async (revision: number, extra: object = {}) => {
			const response = await request(`events/${event.id}`, 'PATCH', {
				...input,
				revision,
				...extra,
			});
			expect(response.status).toBe(200);
			return response.json();
		};
		expect((await update(1, { type: 'COUNTDOWN' })).type).toBe('COUNTDOWN');
		expect((await update(2)).type).toBe('COUNTDOWN');
		expect((await update(3, { type: null })).type).toBeNull();
		expect((await update(4)).type).toBeNull();
		expect((await update(5, { type: 'SIMPLE' })).type).toBe('SIMPLE');
		expect(
			(await request(`events/${event.id}`, 'PATCH', { ...input, revision: 1, type: 'COUNTDOWN' }))
				.status,
		).toBe(409);
		expect((await request('events', 'POST', { ...input, type: 'OTHER' })).status).toBe(400);
		expect((await request('events', 'POST', { ...input, type: null })).status).toBe(201);
		expect((await request('events')).status).toBe(200);
		expect(store.events().map((entry) => entry.type)).toEqual(['SIMPLE', null]);
	});
	test('saves exact repository Markdown, rejects external changes, recovers deletion', async () => {
		const { request, appConfig } = await appFixture();
		const content = '# Architecture\n\n```mermaid\nflowchart LR\n A --> B\n```\n';
		const created = await request('document', 'PUT', {
			source: 'workspace',
			path: 'docs/design.md',
			content,
			hash: null,
		});
		expect(created.status).toBe(200);
		const document = await created.json();
		expect(document.content).toBe(content);
		writeFileSync(join(appConfig.repositories.workspace, 'docs/design.md'), '# External edit\n');
		expect(
			(
				await request('document', 'PUT', {
					source: 'workspace',
					path: 'docs/design.md',
					content: 'stale',
					hash: document.hash,
				})
			).status,
		).toBe(409);
		const current = await (await request('document?source=workspace&path=docs/design.md')).json();
		const removed = await (
			await request('document', 'DELETE', {
				source: 'workspace',
				path: 'docs/design.md',
				hash: current.hash,
			})
		).json();
		expect((await request('document?source=workspace&path=docs/design.md')).status).toBe(404);
		expect((await request(`trash/${removed.trashId}/restore`, 'POST')).status).toBe(200);
		expect(
			(await (await request('document?source=workspace&path=docs/design.md')).json()).content,
		).toBe('# External edit\n');
	});
	test('Jobs API uses jobs and jobId throughout CRUD, board records and search links', async () => {
		const { request } = await appFixture();
		const created = await request('jobs', 'POST', { title: 'API Job' });
		expect(created.status).toBe(201);
		const job = await created.json();
		const board = await (await request('board')).json();
		expect(board.jobs[0].id).toBe(job.id);
		expect(board.sections.every((section: Section) => section.jobId === job.id)).toBe(true);
		const task = await (
			await request('tasks', 'POST', { title: 'Find this task', sectionId: board.sections[0].id })
		).json();
		expect(task.jobId).toBe(job.id);
		const results = await (await request('search?q=Find')).json();
		expect(results[0].url).toBe(`/jobs?task=${task.id}&job=${job.id}`);
		expect(
			(await request(`jobs/${job.id}`, 'PATCH', { title: 'Updated Job', revision: job.revision }))
				.status,
		).toBe(200);
		expect((await request(`jobs/${job.id}?revision=2`, 'DELETE')).status).toBe(200);
		expect((await (await request('board')).json()).jobs).toHaveLength(0);
	});
	test('notes keep stable metadata; conclusions require approval; folder CRUD preserves files', async () => {
		const { request } = await appFixture();
		expect(
			(
				await request('document', 'PUT', {
					source: 'conclusions',
					path: 'workspace/decision.md',
					content: 'decision',
					hash: null,
				})
			).status,
		).toBe(400);
		const conclusion = await (
			await request('document', 'PUT', {
				source: 'conclusions',
				path: 'workspace/decision.md',
				title: 'Decision',
				approvedAt: '2026-10-13',
				tags: ['architecture'],
				content: '# Decision\n',
				hash: null,
			})
		).json();
		expect(conclusion.approvedAt).toBe('2026-10-13');
		expect(conclusion.id).toBeTruthy();
		await request('folders', 'POST', { action: 'create', path: 'Engineering' });
		await request('document', 'PUT', {
			source: 'notes',
			path: 'Engineering/note.md',
			content: '# Note\n',
			hash: null,
		});
		expect(
			(await request('folders', 'POST', { action: 'delete', path: 'Engineering' })).status,
		).toBe(409);
		await request('folders', 'POST', { action: 'move', path: 'Engineering', to: 'Design' });
		expect((await request('document?source=notes&path=Design/note.md')).status).toBe(200);
	});
	test('conclusions stay in their repository scope, including moves and search links', async () => {
		const { request } = await appFixture();
		for (const scope of ['workspace', 'frontend', 'backend']) {
			const response = await request('document', 'PUT', {
				source: 'conclusions',
				path: `${scope}/decision.md`,
				title: `${scope} decision`,
				approvedAt: '2026-10-13',
				content: `# ${scope} decision`,
				hash: null,
			});
			expect(response.status).toBe(200);
		}
		const frontend = await (await request('documents?source=conclusions&scope=frontend')).json();
		expect(frontend.map((item: { path: string }) => item.path)).toEqual(['frontend/decision.md']);
		expect(await (await request('documents?source=conclusions')).json()).toHaveLength(3);
		expect((await request('documents?source=conclusions&scope=invalid')).status).toBe(400);
		expect((await request('documents?source=workspace&scope=frontend')).status).toBe(400);
		expect(
			(
				await request('document', 'PUT', {
					source: 'conclusions',
					path: 'decision.md',
					approvedAt: '2026-10-13',
					content: 'Unscoped',
					hash: null,
				})
			).status,
		).toBe(400);
		const file = await (
			await request('document?source=conclusions&path=frontend/decision.md')
		).json();
		const moved = await (
			await request('document/move', 'POST', {
				source: 'conclusions',
				path: file.path,
				to: 'backend/moved.md',
				hash: file.hash,
			})
		).json();
		expect(moved.id).toBe(file.id);
		expect(await (await request('documents?source=conclusions&scope=frontend')).json()).toEqual([]);
		expect(await (await request('documents?source=conclusions&scope=backend')).json()).toHaveLength(
			2,
		);
		const results = await (await request('search?q=frontend')).json();
		expect(results[0].url).toContain('path=backend%2Fmoved.md');
	});
	test('attachments survive renames and moves; active content is downloaded', async () => {
		const { app, files } = await appFixture();
		let note = await files.save({
			source: 'notes',
			path: 'Engineering/My note.md',
			content: '# Note\n',
			hash: null,
		});
		const form = new FormData();
		form.set('source', 'notes');
		form.set('path', note.path);
		form.set(
			'file',
			new File(['<svg onload="alert(1)"></svg>'], 'diagram.svg', { type: 'image/svg+xml' }),
		);
		const response = await app.fetch(
			new Request('http://localhost:7200/api/v1/attachments', {
				method: 'POST',
				headers: { Authorization: 'Bearer test-agent' },
				body: form,
			}),
		);
		expect(response.status).toBe(201);
		const attachment = await response.json();
		expect(attachment.markdownPath).toContain('My%20note.assets');
		note = await files.save({
			...note,
			content: `# Note\n\n[Diagram](${attachment.markdownPath})\n`,
		});
		await files.move('notes', note.path, 'Engineering/Renamed.md', note.hash);
		note = await files.read('notes', 'Engineering/Renamed.md');
		await files.move('notes', note.path, 'Design/Renamed.md', note.hash);
		const assetPath = `Design/${decodeURI(attachment.markdownPath)}`;
		const asset = await app.fetch(
			new Request(
				`http://localhost:7200/api/v1/asset?source=notes&path=${encodeURIComponent(assetPath)}`,
				{ headers: { Authorization: 'Bearer test-agent' } },
			),
		);
		expect(asset.status).toBe(200);
		expect(asset.headers.get('content-disposition')).toContain('attachment');
		expect(asset.headers.get('content-type')).toBe('application/octet-stream');
	});
	test('Windows junctions cannot escape document roots', async () => {
		const { files, root, appConfig } = await appFixture();
		const outside = join(root, 'outside');
		mkdirSync(outside);
		writeFileSync(join(outside, 'secret.md'), '# Secret');
		symlinkSync(outside, join(appConfig.repositories.workspace, 'escape'), 'junction');
		expect(files.read('workspace', 'escape/secret.md')).rejects.toThrow('Linked paths');
		expect(
			files.save({ source: 'workspace', path: 'escape/new.md', content: '# Escape', hash: null }),
		).rejects.toThrow('Linked paths');
	});
	test('unsafe archives are rejected without replacing existing data', async () => {
		const { store, files } = await appFixture();
		store.createJob('Preserve', '');
		await files.save({ source: 'notes', path: 'note.md', content: '# Preserve\n', hash: null });
		const archive = unzipSync(exportBackup(store));
		archive['../escaped.txt'] = strToU8('bad');
		expect(() => restoreBackup(store, zipSync(archive))).toThrow('Unsafe backup path');
		expect(store.board().jobs[0].title).toBe('Preserve');
		expect((await files.read('notes', 'note.md')).content).toBe('# Preserve\n');
	});
	test('owner session login and revocation; password failures are throttled', async () => {
		const { request, store } = await appFixture();
		store.setSetting('passwordHash', await Bun.password.hash('test-owner-password'));
		const login = await request('auth/login', 'POST', { password: 'test-owner-password' }, false);
		expect(login.status).toBe(200);
		const cookie = login.headers.get('set-cookie')!.split(';')[0];
		expect(login.headers.get('set-cookie')).toContain('HttpOnly');
		expect((await request('board', 'GET', undefined, false, { Cookie: cookie })).status).toBe(200);
		await request('auth/logout', 'POST', undefined, false, { Cookie: cookie });
		expect((await request('board', 'GET', undefined, false, { Cookie: cookie })).status).toBe(401);
		for (let index = 0; index < 10; index++)
			expect((await request('auth/login', 'POST', { password: 'incorrect' }, false)).status).toBe(
				401,
			);
		expect((await request('auth/login', 'POST', { password: 'incorrect' }, false)).status).toBe(
			429,
		);
	});
	test('SQLite and files survive restart; backup restores content without changing credentials', async () => {
		const { store, files, appConfig } = await appFixture();
		const stream = store.createJob('Keep me', '');
		const section = store.board().sections[0];
		store.createTask({
			title: 'Persistent task',
			description: '',
			tags: ['test'],
			links: [],
			sectionId: section.id,
			parentId: null,
		});
		store.createEvent({ title: 'Leap day', description: '', date: '2028-02-29', color: 19 });
		await files.save({ source: 'notes', path: 'note.md', content: '# Original\n', hash: null });
		const archive = exportBackup(store);
		store.updateJob(stream.id, stream.revision, 'Changed', '');
		const note = await files.read('notes', 'note.md');
		await files.save({ ...note, content: '# Changed\n' });
		restoreBackup(store, archive);
		expect(store.board().jobs[0].title).toBe('Keep me');
		expect((await files.read('notes', 'note.md')).content).toBe('# Original\n');
		expect(store.setting('agentTokenHash')).toBe(contentHash('test-agent'));
		const second = new Store(appConfig.dataRoot);
		expect(second.board().tasks).toHaveLength(1);
		expect(second.events()[0].date).toBe('2028-02-29');
		second.db.close(true);
	});
});

describe('calendar and schema', () => {
	test('countdowns use calendar years, months and days, including month ends and leap days', () => {
		expect(formatCountdown('2026-10-16', '2026-10-17')).toBe('1 day ago');
		expect(formatCountdown('2026-10-04', '2026-10-17')).toBe('13 days ago');
		expect(formatCountdown('2026-09-17', '2026-10-17')).toBe('1 month ago');
		expect(formatCountdown('2024-08-14', '2026-10-17')).toBe('2 years, 2 months, 3 days ago');
		expect(formatCountdown('2027-01-31', '2027-03-01')).toBe('1 month, 1 day ago');
		expect(formatCountdown('2024-02-29', '2025-02-28')).toBe('1 year ago');
		expect(formatCountdown('2026-10-17', '2026-10-17')).toBe('Today');
		expect(formatCountdown('2026-10-18', '2026-10-17')).toBe('1 day left');
		expect(formatCountdown('2026-10-30', '2026-10-17')).toBe('13 days left');
		expect(formatCountdown('2026-11-17', '2026-10-17')).toBe('1 month left');
		expect(formatCountdown('2028-12-20', '2026-10-17')).toBe('2 years, 2 months, 3 days left');
		expect(formatCountdown('2027-02-28', '2027-01-31')).toBe('1 month left');
		expect(formatCountdown('2027-03-01', '2027-01-31')).toBe('1 month, 1 day left');
		expect(formatCountdown('2028-02-29', '2028-02-28')).toBe('1 day left');
		expect(formatCountdown('2025-02-28', '2024-02-29')).toBe('1 year left');
		expect(formatCountdown('2027-01-01', '2026-12-31')).toBe('1 day left');
		expect(eventInput.parse({ title: 'Legacy', date: '2028-02-29', color: 0 }).type).toBe('SIMPLE');
	});
	test('legacy calendar databases and recovery records remain usable with a nullable type', () => {
		const f = fixture();
		mkdirSync(f.appConfig.dataRoot);
		const path = join(f.appConfig.dataRoot, 'command-center.sqlite');
		const legacy = new Database(path);
		legacy.run(
			'CREATE TABLE events (id TEXT PRIMARY KEY, date TEXT NOT NULL, title TEXT NOT NULL, description TEXT NOT NULL, color INTEGER NOT NULL CHECK(color BETWEEN 0 AND 19), revision INTEGER NOT NULL DEFAULT 1)',
		);
		legacy.run("INSERT INTO events VALUES ('legacy','2028-02-29','Legacy','',0,1)");
		legacy.close(true);
		const store = new Store(f.appConfig.dataRoot);
		f.entry.store = store;
		expect(store.events()[0].type).toBe('SIMPLE');
		expect(
			store.createEvent({ title: 'Default', description: '', date: '2028-02-29', color: 0 }).type,
		).toBe('SIMPLE');
		expect(
			store.createEvent({
				title: 'Null',
				description: '',
				date: '2028-02-29',
				color: 0,
				type: null,
			}).type,
		).toBeNull();
		expect(() => store.run("UPDATE events SET type='OTHER' WHERE id='legacy'")).toThrow();
		const { type, ...oldRecord } = store.events().find((entry) => entry.id === 'legacy')!;
		store.run("DELETE FROM events WHERE id='legacy'");
		store.restoreRecords(store.trash('records', 'Legacy event', { events: [oldRecord] }));
		expect(store.events().find((entry) => entry.id === 'legacy')?.type).toBeNull();
	});
	test('backups round-trip countdown types and restore archives from before the type column existed', async () => {
		const f = fixture();
		const { store } = await createApp(f.appConfig);
		f.entry.store = store;
		const event = store.createEvent({
			title: 'Countdown',
			description: '',
			date: '2028-02-29',
			color: 0,
			type: 'COUNTDOWN',
		});
		const archive = exportBackup(store);
		store.updateEvent(event.id, 1, { ...event, type: 'SIMPLE' });
		restoreBackup(store, archive);
		expect(store.events()[0].type).toBe('COUNTDOWN');
		const files = unzipSync(archive);
		const snapshotPath = join(f.root, 'legacy-backup.sqlite');
		writeFileSync(snapshotPath, files['database.sqlite']);
		const snapshot = new Database(snapshotPath);
		snapshot.run('ALTER TABLE events DROP COLUMN type');
		const { type, ...oldRecord } = event;
		snapshot.run('INSERT INTO trash VALUES (?,?,?,?,?)', [
			'legacy-trash',
			'records',
			'Legacy event',
			new Date().toISOString(),
			JSON.stringify({ events: [{ ...oldRecord, id: 'recovered' }] }),
		]);
		snapshot.close(true);
		files['database.sqlite'] = new Uint8Array(await Bun.file(snapshotPath).arrayBuffer());
		restoreBackup(store, zipSync(files));
		expect(store.events()[0].type).toBeNull();
		store.restoreRecords('legacy-trash');
		expect(store.events().find((entry) => entry.id === 'recovered')?.type).toBeNull();
	});
	test('dates cover leap years, month transitions and Tehran midnight', () => {
		expect(dateSchema.safeParse('2026-02-29').success).toBe(false);
		expect(dateSchema.safeParse('2028-02-29').success).toBe(true);
		expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
		expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
		expect(localDate(new Date('2026-10-12T20:29:59Z'))).toBe('2026-10-12');
		expect(localDate(new Date('2026-10-12T20:30:00Z'))).toBe('2026-10-13');
	});
	test('parses the real split schema without a database connection', async () => {
		const reader = new SchemaReader(join(config.repositories.backend, 'prisma'));
		const graph = await reader.read();
		expect(graph.stale).toBe(false);
		expect(graph.models).toHaveLength(11);
		expect(
			graph.models
				.filter((model) => model.sourceFile === 'models/organization.prisma')
				.map((model) => model.name),
		).toEqual([
			'Organization',
			'OrganizationMembership',
			'OrganizationInvitation',
			'OrganizationAddress',
		]);
		expect(graph.models.every((model) => model.sourceFile.endsWith('.prisma'))).toBe(true);
		expect(
			graph.models.find((model) => model.name === 'OrganizationMembership')!.uniqueFields,
		).toContainEqual(['organizationId', 'userId']);
		expect(
			graph.models
				.find((model) => model.name === 'AuthSession')!
				.fields.some((field) => field.relationName),
		).toBe(true);
	});
	test('model file ownership handles nested files, comments, strings and cross-file relations', async () => {
		const f = fixture();
		const prisma = join(f.appConfig.repositories.backend, 'prisma');
		mkdirSync(join(prisma, 'models'), { recursive: true });
		writeFileSync(join(prisma, 'schema.prisma'), 'datasource db {\n provider = "postgresql"\n}\n');
		writeFileSync(
			join(prisma, 'models', 'parent.prisma'),
			'/// model Child {\nmodel Parent {\n id String @id\n text String @default("/*")\n children Child[] @relation("Family")\n}\n',
		);
		writeFileSync(
			join(prisma, 'child.prisma'),
			'model Child {\n id String @id\n parentId String?\n parent Parent? @relation("Family", fields: [parentId], references: [id])\n}\n',
		);
		const graph = await new SchemaReader(prisma).read();
		expect(graph.stale).toBe(false);
		expect(graph.models.find((model) => model.name === 'Parent')?.sourceFile).toBe(
			'models/parent.prisma',
		);
		expect(graph.models.find((model) => model.name === 'Child')?.sourceFile).toBe('child.prisma');
		expect(
			graph.models
				.find((model) => model.name === 'Child')
				?.fields.find((field) => field.name === 'parent')?.relationName,
		).toBe('Family');
	});
	test('invalid schema retains its last valid graph', async () => {
		const f = fixture();
		const prisma = join(f.appConfig.repositories.backend, 'prisma');
		mkdirSync(prisma);
		writeFileSync(
			join(prisma, 'schema.prisma'),
			'datasource db {\n provider = "postgresql"\n}\nmodel Example {\n id String @id\n name String?\n @@index([name])\n}\n',
		);
		const reader = new SchemaReader(prisma);
		expect((await reader.read()).models).toHaveLength(1);
		writeFileSync(join(prisma, 'schema.prisma'), 'invalid schema');
		const graph = await reader.read();
		expect(graph.stale).toBe(true);
		expect(graph.models).toHaveLength(1);
		expect(graph.models[0].sourceFile).toBe('schema.prisma');
		expect(graph.error).toBeTruthy();
	});
});
