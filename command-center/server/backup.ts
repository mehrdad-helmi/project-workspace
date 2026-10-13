import { Database } from 'bun:sqlite';
import {
	mkdirSync,
	readFileSync,
	readdirSync,
	renameSync,
	rmSync,
	writeFileSync,
	existsSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import { zipSync, unzipSync, strToU8 } from 'fflate';
import type { Store } from './database';
import { ensure } from './errors';

const folders = ['notes', 'conclusions', 'history', 'deleted'];
export function exportBackup(store: Store) {
	const temporary = join(store.dataRoot, `snapshot-${crypto.randomUUID()}.sqlite`);
	store.db.run(`VACUUM INTO '${temporary.replaceAll("'", "''")}'`);
	try {
		const files: Record<string, Uint8Array> = {
			'manifest.json': strToU8(
				JSON.stringify({ version: 1, exportedAt: new Date().toISOString() }),
			),
			'database.sqlite': new Uint8Array(readFileSync(temporary)),
		};
		const walk = (folder: string, prefix: string) => {
			for (const item of readdirSync(folder, { withFileTypes: true })) {
				const path = join(folder, item.name);
				const key = `${prefix}/${item.name}`;
				if (item.isSymbolicLink()) continue;
				if (item.isDirectory()) walk(path, key);
				else files[key] = new Uint8Array(readFileSync(path));
			}
		};
		for (const folder of folders)
			if (existsSync(join(store.dataRoot, folder))) walk(join(store.dataRoot, folder), folder);
		return zipSync(files, { level: 3 });
	} finally {
		rmSync(temporary, { force: true });
	}
}
export function restoreBackup(store: Store, archive: Uint8Array) {
	let size = 0;
	const files = unzipSync(archive, {
		filter: (entry) => {
			size += entry.originalSize;
			ensure(size <= 500 * 1024 * 1024, 413, 'Expanded backup exceeds 500 MB.');
			return true;
		},
	});
	ensure(
		files['manifest.json'] && files['database.sqlite'],
		400,
		'This is not a Command Center backup.',
	);
	ensure(
		JSON.parse(new TextDecoder().decode(files['manifest.json'])).version === 1,
		400,
		'Unsupported backup version.',
	);
	const stage = join(store.dataRoot, `restore-${crypto.randomUUID()}`);
	mkdirSync(stage);
	try {
		for (const [name, bytes] of Object.entries(files)) {
			ensure(
				!name.includes('\\') &&
					!name.includes(':') &&
					!name.startsWith('/') &&
					!name.split('/').some((part) => part === '..' || part.startsWith('.')),
				400,
				'Unsafe backup path.',
			);
			ensure(
				name === 'manifest.json' ||
					name === 'database.sqlite' ||
					folders.some((folder) => name.startsWith(`${folder}/`)),
				400,
				'Unexpected backup content.',
			);
			const path = join(stage, name);
			mkdirSync(dirname(path), { recursive: true });
			writeFileSync(path, bytes);
		}
		for (const folder of folders) mkdirSync(join(stage, folder), { recursive: true });
		const snapshot = new Database(join(stage, 'database.sqlite'), { readonly: true });
		try {
			ensure(
				snapshot.query('PRAGMA integrity_check').get() &&
					Object.values(snapshot.query('PRAGMA integrity_check').get() as object)[0] === 'ok',
				400,
				'Backup database failed its integrity check.',
			);
			ensure(
				!snapshot.query('PRAGMA foreign_key_check').all().length,
				400,
				'Backup relationships are invalid.',
			);
		} finally {
			snapshot.close(true);
		}
		store.db.run(
			`ATTACH DATABASE '${join(stage, 'database.sqlite').replaceAll("'", "''")}' AS restored`,
		);
		const swapped: string[] = [];
		const revisions = Object.fromEntries(
			['jobs', 'sections', 'tasks', 'events'].map((table) => [
				table,
				new Map(
					store
						.all<{ id: string; revision: number }>(`SELECT id,revision FROM ${table}`)
						.map((row) => [row.id, row.revision]),
				),
			]),
		);
		try {
			store.transaction(() => {
				store.db.run(
					'PRAGMA defer_foreign_keys=ON; DELETE FROM tasks; DELETE FROM sections; DELETE FROM jobs; DELETE FROM events; DELETE FROM trash;',
				);
				for (const table of ['jobs', 'sections', 'tasks', 'events', 'trash'])
					store.db.run(`INSERT INTO main.${table} SELECT * FROM restored.${table}`);
				for (const table of ['jobs', 'sections', 'tasks', 'events'])
					for (const row of store.all<{ id: string; revision: number }>(
						`SELECT id,revision FROM ${table}`,
					))
						store.run(
							`UPDATE ${table} SET revision=? WHERE id=?`,
							Math.max(row.revision, revisions[table].get(row.id) ?? 0) + 1,
							row.id,
						);
				// Reject inconsistent completion and hierarchy even if an archive was edited.
				ensure(
					!store.get(
						'SELECT t.id FROM tasks t JOIN tasks p ON t.parentId=p.id WHERE t.jobId!=p.jobId',
					),
					400,
					'Backup contains inconsistent task parents.',
				);
				ensure(
					!store.get(
						"SELECT t.id FROM tasks t JOIN tasks p ON t.parentId=p.id JOIN sections s ON t.sectionId=s.id JOIN sections ps ON p.sectionId=ps.id WHERE s.kind!='done' AND ps.kind='done'",
					),
					400,
					'Backup contains unfinished descendants of completed tasks.',
				);
				for (const stream of store.board().jobs)
					ensure(
						store.get("SELECT id FROM sections WHERE jobId=? AND kind='done'", stream.id),
						400,
						'Backup is missing Done.',
					);
				for (const task of store.board().tasks) {
					const seen = new Set([task.id]);
					let parent = task.parentId;
					while (parent) {
						ensure(!seen.has(parent), 400, 'Backup contains cyclic tasks.');
						seen.add(parent);
						parent = store.row<{ revision: number; parentId: string | null }>(
							'tasks',
							parent,
						).parentId;
					}
				}
				for (const folder of folders) {
					renameSync(join(store.dataRoot, folder), join(stage, `old-${folder}`));
					try {
						renameSync(join(stage, folder), join(store.dataRoot, folder));
						swapped.push(folder);
					} catch (error) {
						renameSync(join(stage, `old-${folder}`), join(store.dataRoot, folder));
						throw error;
					}
				}
			});
		} catch (error) {
			for (const folder of swapped.reverse()) {
				renameSync(join(store.dataRoot, folder), join(stage, `failed-${folder}`));
				renameSync(join(stage, `old-${folder}`), join(store.dataRoot, folder));
			}
			throw error;
		} finally {
			store.db.run('DETACH DATABASE restored');
		}
	} finally {
		rmSync(stage, { recursive: true, force: true });
	}
}
