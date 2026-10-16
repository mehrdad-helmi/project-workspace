import { Database } from 'bun:sqlite';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Board, CalendarEvent, Section, Task, TrashItem, Job } from '../shared/contracts';
import { ensure } from './errors';

export class Store {
	readonly db: Database;
	constructor(readonly dataRoot: string) {
		mkdirSync(dataRoot, { recursive: true });
		this.db = new Database(join(dataRoot, 'command-center.sqlite'), { create: true, strict: true });
		this.db.run('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
		this.db.run(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
		CREATE TABLE IF NOT EXISTS sessions (hash TEXT PRIMARY KEY, expiresAt INTEGER NOT NULL);
		CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT NOT NULL, position INTEGER NOT NULL, revision INTEGER NOT NULL DEFAULT 1);
		CREATE TABLE IF NOT EXISTS sections (id TEXT PRIMARY KEY, jobId TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE, title TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('inbox','active','done','custom')), position INTEGER NOT NULL, revision INTEGER NOT NULL DEFAULT 1, UNIQUE(id,jobId));
		CREATE UNIQUE INDEX IF NOT EXISTS builtin_sections ON sections(jobId,kind) WHERE kind != 'custom';
		CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, jobId TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE, sectionId TEXT NOT NULL, parentId TEXT REFERENCES tasks(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED, title TEXT NOT NULL, description TEXT NOT NULL, tags TEXT NOT NULL, links TEXT NOT NULL, position INTEGER NOT NULL, revision INTEGER NOT NULL DEFAULT 1, updatedAt TEXT NOT NULL, FOREIGN KEY(sectionId,jobId) REFERENCES sections(id,jobId) DEFERRABLE INITIALLY DEFERRED);
		CREATE INDEX IF NOT EXISTS tasks_board ON tasks(jobId,sectionId,position); CREATE INDEX IF NOT EXISTS tasks_parent ON tasks(parentId);
		CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY, date TEXT NOT NULL, title TEXT NOT NULL, description TEXT NOT NULL, color INTEGER NOT NULL CHECK(color BETWEEN 0 AND 19), revision INTEGER NOT NULL DEFAULT 1);
		CREATE INDEX IF NOT EXISTS events_date ON events(date);
		CREATE TABLE IF NOT EXISTS trash (id TEXT PRIMARY KEY, kind TEXT NOT NULL, title TEXT NOT NULL, deletedAt TEXT NOT NULL, payload TEXT NOT NULL);
		PRAGMA user_version=1;`);
		if (
			!this.all<{ name: string }>('PRAGMA table_info(events)').some(({ name }) => name === 'type')
		)
			this.db.run(
				"ALTER TABLE events ADD COLUMN type TEXT DEFAULT 'SIMPLE' CHECK(type IN ('SIMPLE','COUNTDOWN'))",
			);
	}
	all<T>(sql: string, ...params: (string | number | null)[]): T[] {
		const statement = this.db.prepare(sql);
		try {
			return statement.all(...params) as T[];
		} finally {
			statement.finalize();
		}
	}
	get<T>(sql: string, ...params: (string | number | null)[]): T | null {
		const statement = this.db.prepare(sql);
		try {
			return statement.get(...params) as T | null;
		} finally {
			statement.finalize();
		}
	}
	run(sql: string, ...params: (string | number | null)[]) {
		const statement = this.db.prepare(sql);
		try {
			return statement.run(...params);
		} finally {
			statement.finalize();
		}
	}
	setting(key: string) {
		return this.get<{ value: string }>('SELECT value FROM settings WHERE key=?', key)?.value;
	}
	setSetting(key: string, value: string) {
		this.run(
			'INSERT INTO settings VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
			key,
			value,
		);
	}
	transaction<T>(fn: () => T): T {
		return this.db.transaction(fn).immediate();
	}
	board(): Board {
		return {
			jobs: this.all<Job>('SELECT * FROM jobs ORDER BY position,id'),
			sections: this.all<Section>('SELECT * FROM sections ORDER BY position,id'),
			tasks: this.all<Record<string, unknown>>('SELECT * FROM tasks ORDER BY position,id').map(
				(row) =>
					({
						...row,
						tags: JSON.parse(row.tags as string),
						links: JSON.parse(row.links as string),
					}) as Task,
			),
		};
	}
	row<T extends { revision: number }>(
		table: 'tasks' | 'sections' | 'jobs' | 'events',
		id: string,
		revision?: number,
	): T {
		const row = this.get<T>(`SELECT * FROM ${table} WHERE id=?`, id);
		ensure(row, 404, 'This item no longer exists.');
		if (revision !== undefined)
			ensure(row.revision === revision, 409, 'This item changed. Reload it before saving.');
		return row;
	}
	createJob(title: string, description: string) {
		return this.transaction(() => {
			const id = crypto.randomUUID();
			this.run(
				'INSERT INTO jobs VALUES (?,?,?,?,1)',
				id,
				title,
				description,
				this.all<Job>('SELECT id FROM jobs').length,
			);
			(['inbox', 'active', 'done'] as const).forEach((kind, position) =>
				this.run(
					'INSERT INTO sections VALUES (?,?,?,?,?,1)',
					crypto.randomUUID(),
					id,
					['Inbox', 'In Progress', 'Done'][position],
					kind,
					position,
				),
			);
			return this.row<Job>('jobs', id);
		});
	}
	updateJob(id: string, revision: number, title: string, description: string) {
		return this.transaction(() => {
			this.row('jobs', id, revision);
			this.run(
				'UPDATE jobs SET title=?,description=?,revision=revision+1 WHERE id=?',
				title,
				description,
				id,
			);
			return this.row<Job>('jobs', id);
		});
	}
	createSection(jobId: string, title: string) {
		this.row('jobs', jobId);
		const id = crypto.randomUUID();
		this.run(
			"INSERT INTO sections VALUES (?,?,?,'custom',?,1)",
			id,
			jobId,
			title,
			this.all<Section>('SELECT id FROM sections WHERE jobId=?', jobId).length,
		);
		return this.row<Section>('sections', id);
	}
	updateSection(id: string, revision: number, title: string) {
		return this.transaction(() => {
			const section = this.row<Section>('sections', id, revision);
			ensure(section.kind !== 'done', 400, 'Done has a fixed name.');
			this.run('UPDATE sections SET title=?,revision=revision+1 WHERE id=?', title, id);
			return this.row<Section>('sections', id);
		});
	}
	reorder(
		kind: 'sections' | 'jobs',
		ids: string[],
		revisions: Record<string, number>,
		jobId?: string,
	) {
		return this.transaction(() => {
			const rows =
				kind === 'sections'
					? this.all<Section>('SELECT * FROM sections WHERE jobId=?', jobId!)
					: this.all<Job>('SELECT * FROM jobs');
			ensure(
				ids.length === rows.length &&
					new Set(ids).size === ids.length &&
					rows.every((row) => ids.includes(row.id)),
				400,
				'Supply every item exactly once.',
			);
			ids.forEach((id, position) => {
				ensure(revisions[id], 400, 'Supply revisions for all reordered items.');
				this.row(kind, id, revisions[id]);
				this.run(`UPDATE ${kind} SET position=?,revision=revision+1 WHERE id=?`, position, id);
			});
		});
	}
	descendants(id: string): Task[] {
		return this.all<Record<string, unknown>>(
			'WITH RECURSIVE tree AS (SELECT * FROM tasks WHERE id=? UNION ALL SELECT t.* FROM tasks t JOIN tree ON t.parentId=tree.id) SELECT * FROM tree',
			id,
		).map(
			(row) =>
				({
					...row,
					tags: JSON.parse(row.tags as string),
					links: JSON.parse(row.links as string),
				}) as Task,
		);
	}
	defaultSection(jobId: string, kind: 'inbox' | 'active'): Section {
		const existing = this.get<Section>(
			'SELECT * FROM sections WHERE jobId=? AND kind=?',
			jobId,
			kind,
		);
		if (existing) return existing;
		const id = crypto.randomUUID();
		this.run(
			'INSERT INTO sections VALUES (?,?,?,?,?,1)',
			id,
			jobId,
			kind === 'inbox' ? 'Inbox' : 'In Progress',
			kind,
			this.all<Section>('SELECT id FROM sections WHERE jobId=?', jobId).length,
		);
		return this.row<Section>('sections', id);
	}
	reopenAncestors(parentId: string | null) {
		while (parentId) {
			const task = this.row<Task>('tasks', parentId);
			const section = this.row<Section>('sections', task.sectionId);
			if (section.kind === 'done') {
				const active = this.defaultSection(task.jobId, 'active');
				this.run(
					'UPDATE tasks SET sectionId=?,revision=revision+1,updatedAt=? WHERE id=?',
					active.id,
					new Date().toISOString(),
					task.id,
				);
			}
			parentId = task.parentId;
		}
	}
	createTask(input: {
		title: string;
		description: string;
		tags: string[];
		links: string[];
		sectionId: string;
		parentId: string | null;
	}) {
		return this.transaction(() => {
			const section = this.row<Section>('sections', input.sectionId);
			if (input.parentId)
				ensure(
					this.row<Task>('tasks', input.parentId).jobId === section.jobId,
					400,
					'A subtask must stay in its parent’s Job.',
				);
			const id = crypto.randomUUID();
			this.run(
				'INSERT INTO tasks VALUES (?,?,?,?,?,?,?,?,?,1,?)',
				id,
				section.jobId,
				section.id,
				input.parentId,
				input.title,
				input.description,
				JSON.stringify(input.tags),
				JSON.stringify(input.links),
				this.all<Task>('SELECT id FROM tasks WHERE sectionId=?', section.id).length,
				new Date().toISOString(),
			);
			if (section.kind !== 'done') this.reopenAncestors(input.parentId);
			return this.board().tasks.find((task) => task.id === id)!;
		});
	}
	updateTask(
		id: string,
		input: Partial<
			Pick<Task, 'title' | 'description' | 'tags' | 'links' | 'parentId' | 'sectionId'>
		> & { revision: number; completeAll?: boolean },
	) {
		return this.transaction(() => {
			const original = this.board().tasks.find((task) => task.id === id);
			ensure(original, 404, 'Task not found.');
			this.row('tasks', id, input.revision);
			const parentId = input.parentId === undefined ? original.parentId : input.parentId;
			if (parentId) {
				ensure(
					!this.descendants(id).some((task) => task.id === parentId),
					400,
					'A task cannot be its own descendant.',
				);
				ensure(
					this.row<Task>('tasks', parentId).jobId === original.jobId,
					400,
					'A parent must belong to the same Job.',
				);
			}
			this.run(
				'UPDATE tasks SET title=?,description=?,tags=?,links=?,parentId=?,revision=revision+1,updatedAt=? WHERE id=?',
				input.title ?? original.title,
				input.description ?? original.description,
				JSON.stringify(input.tags ?? original.tags),
				JSON.stringify(input.links ?? original.links),
				parentId,
				new Date().toISOString(),
				id,
			);
			const section = this.row<Section>('sections', original.sectionId);
			if (section.kind !== 'done') this.reopenAncestors(parentId);
			if (input.sectionId && (input.sectionId !== original.sectionId || input.completeAll))
				this.moveTask(id, {
					revision: this.row<Task>('tasks', id).revision,
					sectionId: input.sectionId,
					completeAll: input.completeAll ?? false,
				});
			return this.board().tasks.find((task) => task.id === id)!;
		});
	}
	moveTask(
		id: string,
		input: { revision: number; sectionId: string; completeAll: boolean; beforeId?: string | null },
	) {
		return this.transaction(() => {
			const original = this.row<Task>('tasks', id, input.revision);
			const target = this.row<Section>('sections', input.sectionId);
			const tree = this.descendants(id);
			if (target.jobId !== original.jobId) {
				const inbox = this.defaultSection(target.jobId, 'inbox');
				const done = this.get<Section>(
					"SELECT * FROM sections WHERE jobId=? AND kind='done'",
					target.jobId,
				)!;
				for (const task of tree) {
					const completed = this.row<Section>('sections', task.sectionId).kind === 'done';
					this.run(
						'UPDATE tasks SET jobId=?,sectionId=?,parentId=?,revision=revision+1,updatedAt=? WHERE id=?',
						target.jobId,
						completed ? done.id : inbox.id,
						task.id === id ? null : task.parentId,
						new Date().toISOString(),
						task.id,
					);
				}
			} else {
				if (target.kind === 'done') {
					const unfinished = tree
						.slice(1)
						.filter((task) => this.row<Section>('sections', task.sectionId).kind !== 'done');
					ensure(
						!unfinished.length || input.completeAll,
						409,
						`${unfinished.length} unfinished subtasks remain. Complete them first or choose Complete all subtasks.`,
					);
					if (input.completeAll)
						tree
							.slice(1)
							.forEach((task) =>
								this.run(
									'UPDATE tasks SET sectionId=?,revision=revision+1,updatedAt=? WHERE id=?',
									target.id,
									new Date().toISOString(),
									task.id,
								),
							);
				}
				this.run(
					'UPDATE tasks SET sectionId=?,revision=revision+1,updatedAt=? WHERE id=?',
					target.id,
					new Date().toISOString(),
					id,
				);
				if (target.kind !== 'done') this.reopenAncestors(original.parentId);
			}
			const current = this.row<Task>('tasks', id);
			const ordered = this.all<Task>(
				'SELECT * FROM tasks WHERE sectionId=? AND id!=? ORDER BY position,id',
				current.sectionId,
				id,
			);
			if (input.beforeId)
				ensure(
					ordered.some((task) => task.id === input.beforeId),
					409,
					'The drop target changed. Reload the board.',
				);
			const index = input.beforeId
				? ordered.findIndex((task) => task.id === input.beforeId)
				: ordered.length;
			ordered.splice(index, 0, current);
			ordered.forEach((task, position) => {
				if (task.position !== position)
					this.run('UPDATE tasks SET position=?,revision=revision+1 WHERE id=?', position, task.id);
			});
			return this.board().tasks.find((task) => task.id === id)!;
		});
	}
	createEvent(
		input: Omit<CalendarEvent, 'id' | 'revision' | 'type'> & { type?: CalendarEvent['type'] },
	) {
		const id = crypto.randomUUID();
		this.run(
			'INSERT INTO events (id,date,title,description,color,revision,type) VALUES (?,?,?,?,?,1,?)',
			id,
			input.date,
			input.title,
			input.description,
			input.color,
			input.type === undefined ? 'SIMPLE' : input.type,
		);
		return this.row<CalendarEvent>('events', id);
	}
	updateEvent(
		id: string,
		revision: number,
		input: Omit<CalendarEvent, 'id' | 'revision' | 'type'> & { type?: CalendarEvent['type'] },
	) {
		return this.transaction(() => {
			const current = this.row<CalendarEvent>('events', id, revision);
			this.run(
				'UPDATE events SET date=?,title=?,description=?,color=?,type=?,revision=revision+1 WHERE id=?',
				input.date,
				input.title,
				input.description,
				input.color,
				input.type === undefined ? current.type : input.type,
				id,
			);
			return this.row<CalendarEvent>('events', id);
		});
	}
	events() {
		return this.all<CalendarEvent>('SELECT * FROM events ORDER BY date,title');
	}
	trash(kind: string, title: string, payload: unknown) {
		const id = crypto.randomUUID();
		this.run(
			'INSERT INTO trash VALUES (?,?,?,?,?)',
			id,
			kind,
			title,
			new Date().toISOString(),
			JSON.stringify(payload),
		);
		return id;
	}
	trashList() {
		return this.all<TrashItem>('SELECT id,kind,title,deletedAt FROM trash ORDER BY deletedAt DESC');
	}
	delete(kind: 'tasks' | 'jobs' | 'sections' | 'events', id: string, revision: number) {
		return this.transaction(() => {
			const row = this.row<Task | Job | Section | CalendarEvent>(kind, id, revision);
			let rows: Record<string, unknown[]> = { [kind]: [row] };
			if (kind === 'sections') {
				ensure((row as Section).kind !== 'done', 400, 'Done cannot be deleted.');
				ensure(
					!this.get('SELECT id FROM tasks WHERE sectionId=?', id),
					409,
					'Move all tasks before deleting this section.',
				);
			}
			if (kind === 'tasks')
				rows.tasks = this.all(
					'WITH RECURSIVE tree AS (SELECT * FROM tasks WHERE id=? UNION ALL SELECT t.* FROM tasks t JOIN tree ON t.parentId=tree.id) SELECT * FROM tree',
					id,
				);
			if (kind === 'jobs')
				rows = {
					jobs: [row],
					sections: this.all('SELECT * FROM sections WHERE jobId=?', id),
					tasks: this.all('SELECT * FROM tasks WHERE jobId=?', id),
				};
			const trashId = this.trash('records', row.title, rows);
			this.run(`DELETE FROM ${kind} WHERE id=?`, id);
			return {
				trashId,
				affected: Object.values(rows).reduce((sum, values) => sum + values.length, 0),
			};
		});
	}
	restoreRecords(id: string) {
		return this.transaction(() => {
			const item = this.get<{ payload: string; kind: string }>(
				'SELECT * FROM trash WHERE id=?',
				id,
			);
			ensure(item && item.kind === 'records', 404, 'Recoverable records not found.');
			const rows = JSON.parse(item.payload) as Record<string, Record<string, unknown>[]>;
			for (const table of ['jobs', 'sections', 'tasks', 'events'])
				for (const row of rows[table] ?? []) {
					if (table === 'events' && !('type' in row)) row.type = null;
					const columns = Object.keys(row);
					const allowed = this.all<{ name: string }>(`PRAGMA table_info(${table})`).map(
						(column) => column.name,
					);
					ensure(
						columns.length === allowed.length &&
							columns.every((column) => allowed.includes(column)),
						400,
						'Invalid recovery record.',
					);
					if ('revision' in row) row.revision = Number(row.revision) + 1;
					if (
						table === 'sections' &&
						['inbox', 'active'].includes(String(row.kind)) &&
						this.get(
							'SELECT id FROM sections WHERE jobId=? AND kind=?',
							String(row.jobId),
							String(row.kind),
						)
					)
						row.kind = 'custom';
					this.run(
						`INSERT INTO ${table} (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`,
						...(Object.values(row) as (string | number | null)[]),
					);
				}
			for (const task of rows.tasks ?? []) {
				const section = this.row<Section>('sections', task.sectionId as string);
				if (section.kind !== 'done') this.reopenAncestors(task.parentId as string | null);
			}
			this.run('DELETE FROM trash WHERE id=?', id);
		});
	}
}
