import { mkdir, readdir, readFile, realpath, rename, stat, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import matter from 'gray-matter';
import type { AppConfig } from '../config';
import {
	repositoryScopes,
	type DocumentFile,
	type DocumentItem,
	type FileSource,
	type RepositoryScope,
} from '../shared/contracts';
import type { Store } from './database';
import { ensure } from './errors';

export const contentHash = (content: string | Uint8Array) =>
	new Bun.CryptoHasher('sha256').update(content).digest('hex');
export class Files {
	readonly roots: Record<FileSource, string>;
	constructor(
		readonly store: Store,
		readonly config: AppConfig,
	) {
		this.roots = {
			...config.repositories,
			notes: join(config.dataRoot, 'notes'),
			conclusions: join(config.dataRoot, 'conclusions'),
		};
	}
	async initialize() {
		await Promise.all(
			['notes', 'conclusions', 'history', 'deleted', 'backups'].map((folder) =>
				mkdir(join(this.config.dataRoot, folder), { recursive: true }),
			),
		);
		await Promise.all(
			repositoryScopes.map((scope) =>
				mkdir(join(this.roots.conclusions, scope), { recursive: true }),
			),
		);
	}
	async safePath(source: FileSource, path: string, create = false) {
		ensure(Object.hasOwn(this.roots, source), 400, 'Unknown document source.');
		ensure(
			path && !isAbsolute(path) && !path.includes(':') && !path.includes('\0'),
			400,
			'Use a repository-relative path.',
		);
		const pieces = path.replaceAll('\\', '/').split('/');
		if (source === 'conclusions')
			ensure(
				repositoryScopes.includes(pieces[0] as RepositoryScope) && pieces.length > 1,
				400,
				'Conclusion paths must start with workspace/, frontend/, or backend/.',
			);
		ensure(
			!pieces.some(
				(piece) => piece === '..' || this.config.exclusions.has(piece) || piece.startsWith('.'),
			),
			403,
			'This path is outside the accessible document area.',
		);
		const root = await realpath(this.roots[source]);
		const target = resolve(root, ...pieces);
		const contained = (value: string) => {
			const rel = relative(root, value);
			return rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
		};
		ensure(contained(target), 403, 'This path is outside the repository.');
		let existing = target;
		if (create) while (!existsSync(existing)) existing = dirname(existing);
		ensure(contained(await realpath(existing)), 403, 'Linked paths cannot escape the repository.');
		return target;
	}
	async list(source: FileSource, scope?: RepositoryScope): Promise<DocumentItem[]> {
		const root = this.roots[source];
		const folder = source === 'conclusions' && scope ? join(root, scope) : root;
		if (!existsSync(folder)) return [];
		const items: DocumentItem[] = [];
		const walk = async (folder: string) => {
			for (const entry of await readdir(folder, { withFileTypes: true })) {
				if (
					entry.isSymbolicLink() ||
					entry.name.startsWith('.') ||
					this.config.exclusions.has(entry.name)
				)
					continue;
				const path = join(folder, entry.name);
				if (entry.isDirectory()) await walk(path);
				else if (entry.isFile() && ['.md', '.markdown'].includes(extname(path).toLowerCase())) {
					const rel = relative(root, path).replaceAll('\\', '/');
					try {
						const file = await this.read(source, rel);
						const { content: _content, hash: _hash, ...item } = file;
						items.push(item);
					} catch {
						/* A file may disappear during discovery. */
					}
				}
			}
		};
		await walk(folder);
		return items.sort((a, b) => a.path.localeCompare(b.path));
	}
	async read(source: FileSource, path: string): Promise<DocumentFile> {
		ensure(
			['.md', '.markdown'].includes(extname(path).toLowerCase()),
			400,
			'Documents must be Markdown files.',
		);
		const target = await this.safePath(source, path);
		const info = await stat(target);
		ensure(info.size <= 5_000_000, 413, 'This document exceeds the editor limit.');
		const raw = await readFile(target, 'utf8');
		const owned = source === 'notes' || source === 'conclusions';
		const parsed = owned ? matter(raw) : { data: {}, content: raw };
		const data = parsed.data as Record<string, unknown>;
		return {
			source,
			path,
			content: parsed.content,
			hash: contentHash(raw),
			title:
				typeof data.title === 'string'
					? data.title
					: (parsed.content.match(/^#\s+(.+)$/m)?.[1] ?? basename(path, extname(path))),
			updatedAt: info.mtime.toISOString(),
			id: typeof data.id === 'string' ? data.id : undefined,
			tags: Array.isArray(data.tags) ? data.tags.filter((tag) => typeof tag === 'string') : [],
			approvedAt: data.approvedAt ? String(data.approvedAt) : undefined,
			sourceChat: typeof data.sourceChat === 'string' ? data.sourceChat : undefined,
		};
	}
	async save(input: {
		source: FileSource;
		path: string;
		content: string;
		hash: string | null;
		title?: string;
		tags?: string[];
		approvedAt?: string;
		sourceChat?: string | null;
	}) {
		ensure(
			['.md', '.markdown'].includes(extname(input.path).toLowerCase()),
			400,
			'Documents must be Markdown files.',
		);
		const target = await this.safePath(input.source, input.path, true);
		const existing = existsSync(target) ? await readFile(target, 'utf8') : null;
		ensure(
			existing === null ? input.hash === null : contentHash(existing) === input.hash,
			409,
			'The file changed outside this editor. Your draft is preserved; reload or save it under a new name.',
		);
		let content = input.content;
		if (input.source === 'notes' || input.source === 'conclusions') {
			const metadata = existing === null ? {} : matter(existing).data;
			if (input.source === 'conclusions')
				ensure(
					input.approvedAt ?? metadata.approvedAt,
					400,
					'A conclusion requires its approval date.',
				);
			content = matter.stringify(input.content, {
				...metadata,
				id: metadata.id ?? crypto.randomUUID(),
				title: input.title ?? metadata.title ?? basename(input.path, extname(input.path)),
				tags: input.tags ?? metadata.tags ?? [],
				...(input.approvedAt ? { approvedAt: input.approvedAt } : {}),
				...(input.sourceChat !== undefined ? { sourceChat: input.sourceChat } : {}),
			});
		}
		await mkdir(dirname(target), { recursive: true });
		if (existing !== null)
			await writeFile(
				join(this.config.dataRoot, 'history', `${crypto.randomUUID()}.json`),
				JSON.stringify({
					source: input.source,
					path: input.path,
					savedAt: new Date().toISOString(),
					content: existing,
				}),
			);
		const temporary = join(dirname(target), `.cc-${crypto.randomUUID()}.tmp`);
		await writeFile(temporary, content);
		// The second check catches external edits during attachment/history preparation.
		try {
			const latest = existsSync(target) ? await readFile(target, 'utf8') : null;
			ensure(latest === existing, 409, 'The file changed while saving. Your draft is preserved.');
			await rename(temporary, target);
		} finally {
			await rm(temporary, { force: true });
		}
		return this.read(input.source, input.path);
	}
	async move(source: FileSource, path: string, to: string, hash: string) {
		const original = await this.read(source, path);
		ensure(original.hash === hash, 409, 'The file changed. Reload before moving it.');
		ensure(extname(to).toLowerCase() === '.md', 400, 'Use a .md filename.');
		const target = await this.safePath(source, to, true);
		ensure(!existsSync(target), 409, 'A document already exists at that path.');
		const origin = await this.safePath(source, path);
		await mkdir(dirname(target), { recursive: true });
		const names = new Set([
			`${basename(path, extname(path))}.assets`,
			...[...original.content.matchAll(/\]\((?:\.\/)?([^\s/()]+\.assets)\//g)].map((match) =>
				decodeURIComponent(match[1]),
			),
		]);
		const moved: [string, string][] = [];
		try {
			for (const name of names) {
				const assetPath = join(dirname(path), name).replaceAll('\\', '/');
				const assets = await this.safePath(source, assetPath, true);
				const movedAssets = await this.safePath(
					source,
					join(dirname(to), name).replaceAll('\\', '/'),
					true,
				);
				if (existsSync(assets) && assets !== movedAssets) {
					ensure(
						!existsSync(movedAssets),
						409,
						'The destination attachment folder already exists.',
					);
					await rename(assets, movedAssets);
					moved.push([assets, movedAssets]);
				}
			}
			ensure(
				(await this.read(source, path)).hash === hash,
				409,
				'The document changed while moving. Reload before retrying.',
			);
			await rename(origin, target);
		} catch (error) {
			for (const [assets, movedAssets] of moved.reverse()) await rename(movedAssets, assets);
			throw error;
		}
		return this.read(source, to);
	}
	async remove(source: FileSource, path: string, hash: string) {
		const file = await this.read(source, path);
		ensure(file.hash === hash, 409, 'The file changed. Reload before deleting it.');
		const id = crypto.randomUUID();
		const stored = join(this.config.dataRoot, 'deleted', `${id}.md`);
		await rename(await this.safePath(source, path), stored);
		try {
			const trashId = this.store.trash('file', file.title, { source, path, stored: `${id}.md` });
			return { trashId };
		} catch (error) {
			await rename(stored, await this.safePath(source, path, true));
			throw error;
		}
	}
	async restore(id: string) {
		const item = this.store.get<{ kind: string; payload: string }>(
			'SELECT * FROM trash WHERE id=?',
			id,
		);
		ensure(item, 404, 'Recovery item not found.');
		if (item.kind === 'records') return this.store.restoreRecords(id);
		if (item.kind === 'folder') {
			const payload = JSON.parse(item.payload) as { path: string };
			const target = await this.safePath('notes', payload.path, true);
			ensure(!existsSync(target), 409, 'The original folder path is occupied.');
			await mkdir(target, { recursive: true });
			this.store.run('DELETE FROM trash WHERE id=?', id);
			return;
		}
		const payload = JSON.parse(item.payload) as {
			source: FileSource;
			path: string;
			stored: string;
		};
		ensure(/^[0-9a-f-]+\.md$/i.test(payload.stored), 400, 'Invalid recovery file reference.');
		const target = await this.safePath(payload.source, payload.path, true);
		ensure(!existsSync(target), 409, 'The original path is occupied. Move that document first.');
		await mkdir(dirname(target), { recursive: true });
		await rename(join(this.config.dataRoot, 'deleted', payload.stored), target);
		this.store.run('DELETE FROM trash WHERE id=?', id);
	}
	async folders() {
		const folders: string[] = [];
		const walk = async (folder: string, prefix = '') => {
			for (const entry of await readdir(folder, { withFileTypes: true }))
				if (
					entry.isDirectory() &&
					!entry.isSymbolicLink() &&
					!entry.name.endsWith('.assets') &&
					!entry.name.startsWith('.')
				) {
					const path = prefix ? `${prefix}/${entry.name}` : entry.name;
					folders.push(path);
					await walk(join(folder, entry.name), path);
				}
		};
		await walk(this.roots.notes);
		return folders;
	}
	async folder(action: 'create' | 'move' | 'delete', path: string, to?: string) {
		const origin = await this.safePath('notes', path, action === 'create');
		if (action === 'create') {
			ensure(!existsSync(origin), 409, 'This folder already exists.');
			await mkdir(origin, { recursive: true });
		}
		if (action === 'move') {
			ensure(to && !to.startsWith(`${path}/`), 400, 'Choose a destination outside this folder.');
			const target = await this.safePath('notes', to, true);
			ensure(!existsSync(target), 409, 'The destination exists.');
			await mkdir(dirname(target), { recursive: true });
			await rename(origin, target);
		}
		if (action === 'delete') {
			ensure(
				(await readdir(origin)).length === 0,
				409,
				'Move or delete the pages before removing the folder.',
			);
			const { rmdir } = await import('node:fs/promises');
			await rmdir(origin);
			try {
				this.store.trash('folder', path, { path });
			} catch (error) {
				await mkdir(origin, { recursive: true });
				throw error;
			}
		}
		return this.folders();
	}
	async attachment(source: FileSource, path: string, upload: File) {
		ensure(
			upload.size > 0 && upload.size <= this.config.uploadLimit,
			413,
			'Attachments must be between 1 byte and 50 MB.',
		);
		const document = await this.read(source, path);
		const name = `${crypto.randomUUID()}-${basename(upload.name).replace(/[^a-zA-Z0-9._-]/g, '_')}`;
		const assetPath = join(
			dirname(path),
			`${basename(path, extname(path))}.assets`,
			name,
		).replaceAll('\\', '/');
		const target = await this.safePath(source, assetPath, true);
		await mkdir(dirname(target), { recursive: true });
		await writeFile(target, new Uint8Array(await upload.arrayBuffer()));
		return {
			path: assetPath,
			url: `/api/v1/asset?source=${source}&path=${encodeURIComponent(assetPath)}`,
			markdownPath: encodeURI(`${basename(path, extname(path))}.assets/${name}`),
			documentHash: document.hash,
		};
	}
}
