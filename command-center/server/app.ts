import { Hono } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { streamSSE } from 'hono/streaming';
import { z } from 'zod';
import { readFile } from 'node:fs/promises';
import { extname, join, basename } from 'node:path';
import type { AppConfig } from '../config';
import {
	eventInput,
	fileInput,
	moveInput,
	revisionSchema,
	repositoryScopeSchema,
	sectionInput,
	taskInput,
	taskPatch,
	titleSchema,
	jobInput,
	type FileSource,
} from '../shared/contracts';
import { Store } from './database';
import { Files, contentHash } from './files';
import { SchemaReader } from './schema';
import { AppError, ensure } from './errors';
import { exportBackup, restoreBackup } from './backup';

const sourceSchema = fileInput.shape.source;
const fileReference = z.object({ source: sourceSchema, path: z.string().min(1), hash: z.string() });
export async function createApp(config: AppConfig) {
	const store = new Store(config.dataRoot);
	const files = new Files(store, config);
	await files.initialize();
	const schema = new SchemaReader(join(config.repositories.backend, 'prisma'));
	const app = new Hono();
	const listeners = new Set<() => void>();
	const notify = () => listeners.forEach((listener) => listener());
	let queue = Promise.resolve();
	const mutate = <T>(fn: () => Promise<T> | T): Promise<T> => {
		const next = queue.then(fn);
		queue = next.then(
			() => {},
			() => {},
		);
		return next.then((value) => {
			notify();
			return value;
		});
	};
	const attempts = new Map<string, { count: number; reset: number }>();
	app.onError((error, c) => {
		if (error instanceof z.ZodError)
			return c.json(
				{
					error: error.issues
						.map((issue) => `${issue.path.join('.')}: ${issue.message}`)
						.join('; '),
				},
				400,
			);
		if (error instanceof AppError) return c.json({ error: error.message }, error.status as 400);
		if ('code' in error && String(error.code).includes('SQLITE_CONSTRAINT'))
			return c.json(
				{ error: 'A related item changed or no longer exists. Reload before retrying.' },
				409,
			);
		if ('code' in error && error.code === 'ENOENT')
			return c.json({ error: 'The requested file no longer exists.' }, 404);
		console.error(error);
		return c.json({ error: 'The operation failed. Your saved data has been preserved.' }, 500);
	});
	app.use('*', async (c, next) => {
		c.header('X-Content-Type-Options', 'nosniff');
		c.header('Referrer-Policy', 'same-origin');
		c.header('X-Frame-Options', 'SAMEORIGIN');
		const host = (c.req.header('host')?.split(':')[0] ?? new URL(c.req.url).hostname).toLowerCase();
		ensure(
			host && config.allowedHosts.includes(host),
			403,
			'Host not allowed. Add this host or LAN IP to CC_ALLOWED_HOSTS.',
		);
		if (c.req.header('origin'))
			ensure(
				c.req.header('origin') === new URL(c.req.url).origin,
				403,
				'Requests from other origins are not allowed.',
			);
		if (c.req.path.startsWith('/api/')) c.header('Cache-Control', 'no-store');
		await next();
	});
	app.get('/api/v1/auth/status', (c) => c.json({ configured: !!store.setting('passwordHash') }));
	app.post('/api/v1/auth/login', async (c) => {
		const { password } = z
			.object({ password: z.string().min(1).max(1000) })
			.parse(await c.req.json());
		const ip = (c.env as { remoteAddress?: string } | undefined)?.remoteAddress ?? 'unknown';
		const now = Date.now();
		if (attempts.size > 1000)
			for (const [key, entry] of attempts) if (entry.reset <= now) attempts.delete(key);
		const attempt = attempts.get(ip);
		ensure(
			!attempt || attempt.reset <= now || attempt.count < 10,
			429,
			'Too many login attempts. Try again in 15 minutes.',
		);
		const hash = store.setting('passwordHash');
		ensure(hash, 503, 'Run bun run setup on the host first.');
		if (!(await Bun.password.verify(password, hash))) {
			attempts.set(ip, {
				count: attempt && attempt.reset > now ? attempt.count + 1 : 1,
				reset: attempt && attempt.reset > now ? attempt.reset : now + 900000,
			});
			throw new AppError(401, 'Incorrect password.');
		}
		attempts.delete(ip);
		const token = crypto.randomUUID() + crypto.randomUUID();
		store.run('DELETE FROM sessions WHERE expiresAt<=?', now);
		store.run(
			'INSERT INTO sessions VALUES (?,?)',
			contentHash(token),
			now + config.sessionDays * 86400000,
		);
		setCookie(c, 'cc_session', token, {
			httpOnly: true,
			sameSite: 'Strict',
			path: '/',
			maxAge: config.sessionDays * 86400,
		});
		return c.json({ ok: true });
	});
	app.use('/api/v1/*', async (c, next) => {
		const bearer = c.req.header('authorization');
		const agent = store.setting('agentTokenHash');
		const token = bearer?.startsWith('Bearer ') ? bearer.slice(7) : undefined;
		const cookie = getCookie(c, 'cc_session');
		const validAgent = token && agent && contentHash(token) === agent;
		const session =
			cookie &&
			store.get<{ expiresAt: number }>(
				'SELECT expiresAt FROM sessions WHERE hash=?',
				contentHash(cookie),
			);
		ensure(
			validAgent || (session && session.expiresAt > Date.now()),
			401,
			'Sign in to access the Command Center.',
		);
		await next();
	});
	app.post('/api/v1/auth/logout', (c) => {
		const cookie = getCookie(c, 'cc_session');
		if (cookie) store.run('DELETE FROM sessions WHERE hash=?', contentHash(cookie));
		deleteCookie(c, 'cc_session', { path: '/' });
		return c.json({ ok: true });
	});
	app.get('/api/v1/me', (c) =>
		c.json({
			timezone: config.timezone,
			colors: config.colors,
			weekStartsOn: config.weekStartsOn,
			weekends: config.weekends,
			uploadLimit: config.uploadLimit,
		}),
	);
	app.get('/api/v1/board', (c) => c.json(store.board()));
	app.post('/api/v1/jobs', async (c) => {
		const input = jobInput.parse(await c.req.json());
		return c.json(await mutate(() => store.createJob(input.title, input.description)), 201);
	});
	app.patch('/api/v1/jobs/:id', async (c) => {
		const input = jobInput.extend({ revision: revisionSchema }).parse(await c.req.json());
		return c.json(
			await mutate(() =>
				store.updateJob(c.req.param('id'), input.revision, input.title, input.description),
			),
		);
	});
	app.post('/api/v1/sections', async (c) => {
		const input = sectionInput.parse(await c.req.json());
		return c.json(await mutate(() => store.createSection(input.jobId, input.title)), 201);
	});
	app.patch('/api/v1/sections/:id', async (c) => {
		const input = z
			.object({ title: titleSchema, revision: revisionSchema })
			.parse(await c.req.json());
		return c.json(
			await mutate(() => store.updateSection(c.req.param('id'), input.revision, input.title)),
		);
	});
	app.post('/api/v1/reorder', async (c) => {
		const input = z
			.object({
				kind: z.enum(['sections', 'jobs']),
				ids: z.array(z.string().uuid()),
				revisions: z.record(z.string(), revisionSchema),
				jobId: z.string().uuid().optional(),
			})
			.parse(await c.req.json());
		ensure(input.kind !== 'sections' || input.jobId, 400, 'Supply a Job for section ordering.');
		await mutate(() => store.reorder(input.kind, input.ids, input.revisions, input.jobId));
		return c.json({ ok: true });
	});
	app.post('/api/v1/tasks', async (c) =>
		c.json(await mutate(async () => store.createTask(taskInput.parse(await c.req.json()))), 201),
	);
	app.patch('/api/v1/tasks/:id', async (c) => {
		const input = taskPatch.parse(await c.req.json());
		return c.json(await mutate(() => store.updateTask(c.req.param('id'), input)));
	});
	app.post('/api/v1/tasks/:id/move', async (c) => {
		const input = moveInput.parse(await c.req.json());
		return c.json(await mutate(() => store.moveTask(c.req.param('id'), input)));
	});
	for (const kind of ['jobs', 'sections', 'tasks', 'events'] as const)
		app.delete(`/api/v1/${kind}/:id`, async (c) => {
			const revision = z.coerce.number().int().positive().parse(c.req.query('revision'));
			return c.json(await mutate(() => store.delete(kind, c.req.param('id'), revision)));
		});
	app.get('/api/v1/events', (c) => c.json(store.events()));
	app.post('/api/v1/events', async (c) => {
		const input = eventInput.parse(await c.req.json());
		return c.json(await mutate(() => store.createEvent(input)), 201);
	});
	app.patch('/api/v1/events/:id', async (c) => {
		const { revision, ...input } = eventInput
			.extend({ revision: revisionSchema })
			.parse(await c.req.json());
		return c.json(await mutate(() => store.updateEvent(c.req.param('id'), revision, input)));
	});
	app.get('/api/v1/documents', async (c) => {
		const source = c.req.query('source');
		const scope = c.req.query('scope')
			? repositoryScopeSchema.parse(c.req.query('scope'))
			: undefined;
		ensure(
			!scope || source === 'conclusions',
			400,
			'Repository scope applies to conclusions only.',
		);
		return c.json(
			source
				? await files.list(sourceSchema.parse(source), scope)
				: (
						await Promise.all(Object.keys(files.roots).map((key) => files.list(key as FileSource)))
					).flat(),
		);
	});
	app.get('/api/v1/document', async (c) =>
		c.json(
			await files.read(
				sourceSchema.parse(c.req.query('source')),
				z.string().min(1).parse(c.req.query('path')),
			),
		),
	);
	app.put('/api/v1/document', async (c) => {
		const input = fileInput.parse(await c.req.json());
		return c.json(await mutate(() => files.save(input)));
	});
	app.post('/api/v1/document/move', async (c) => {
		const input = fileReference.extend({ to: z.string().min(1) }).parse(await c.req.json());
		return c.json(await mutate(() => files.move(input.source, input.path, input.to, input.hash)));
	});
	app.delete('/api/v1/document', async (c) => {
		const input = fileReference.parse(await c.req.json());
		return c.json(await mutate(() => files.remove(input.source, input.path, input.hash)));
	});
	app.get('/api/v1/folders', async (c) => c.json(await files.folders()));
	app.post('/api/v1/folders', async (c) => {
		const input = z
			.object({
				action: z.enum(['create', 'move', 'delete']),
				path: z.string().min(1),
				to: z.string().optional(),
			})
			.parse(await c.req.json());
		return c.json(await mutate(() => files.folder(input.action, input.path, input.to)));
	});
	app.post('/api/v1/attachments', async (c) => {
		const form = await c.req.formData();
		const source = sourceSchema.parse(form.get('source'));
		const path = z.string().min(1).parse(form.get('path'));
		const file = form.get('file');
		ensure(file instanceof File, 400, 'Choose a file to attach.');
		return c.json(await mutate(() => files.attachment(source, path, file)), 201);
	});
	app.get('/api/v1/asset', async (c) => {
		const source = sourceSchema.parse(c.req.query('source'));
		const path = z.string().min(1).parse(c.req.query('path'));
		const target = await files.safePath(source, path);
		const file = Bun.file(target);
		ensure(await file.exists(), 404, 'Attachment not found.');
		ensure(file.size <= config.uploadLimit, 413, 'Attachment is too large.');
		const extension = extname(path).toLowerCase();
		const safe = [
			'.png',
			'.jpg',
			'.jpeg',
			'.webp',
			'.gif',
			'.avif',
			'.mp3',
			'.wav',
			'.ogg',
			'.mp4',
			'.webm',
			'.pdf',
		].includes(extension);
		// SVG/HTML and arbitrary files are downloads; never active same-origin content.
		c.header('Content-Type', safe ? file.type : 'application/octet-stream');
		c.header(
			'Content-Disposition',
			`${safe && c.req.query('download') !== '1' ? 'inline' : 'attachment'}; filename="${basename(path).replace(/[^a-zA-Z0-9._-]/g, '_')}"`,
		);
		c.header('Content-Security-Policy', "sandbox; default-src 'none'");
		return c.body(await file.arrayBuffer());
	});
	app.get('/api/v1/schema', async (c) => c.json(await schema.read()));
	app.get('/api/v1/search', async (c) => {
		const query = (c.req.query('q') ?? '').trim().toLowerCase();
		if (query.length < 2) return c.json([]);
		const results: { title: string; kind: string; url: string; excerpt: string }[] = [];
		for (const task of store.board().tasks)
			if (`${task.title} ${task.description} ${task.tags.join(' ')}`.toLowerCase().includes(query))
				results.push({
					title: task.title,
					kind: 'Task',
					url: `/jobs?task=${task.id}&job=${task.jobId}`,
					excerpt: task.description.slice(0, 160),
				});
		for (const event of store.events())
			if (`${event.title} ${event.description}`.toLowerCase().includes(query))
				results.push({
					title: event.title,
					kind: 'Calendar',
					url: `/calendar?date=${event.date}&event=${event.id}`,
					excerpt: event.date,
				});
		for (const source of Object.keys(files.roots) as FileSource[])
			for (const item of await files.list(source)) {
				const document = await files.read(source, item.path);
				const index = `${document.title}\n${document.content}`.toLowerCase().indexOf(query);
				if (index >= 0)
					results.push({
						title: document.title,
						kind: source,
						url: `/${source === 'notes' || source === 'conclusions' ? source : 'documents'}?source=${source}&path=${encodeURIComponent(item.path)}`,
						excerpt: document.content.slice(
							Math.max(0, index - document.title.length - 40),
							Math.max(0, index - document.title.length - 40) + 160,
						),
					});
			}
		return c.json(results.slice(0, 100));
	});
	app.get('/api/v1/trash', (c) => c.json(store.trashList()));
	app.post('/api/v1/trash/:id/restore', async (c) => {
		await mutate(() => files.restore(c.req.param('id')));
		return c.json({ ok: true });
	});
	app.get('/api/v1/backup', async (c) => {
		const archive = await mutate(() => exportBackup(store));
		c.header('Content-Type', 'application/zip');
		c.header(
			'Content-Disposition',
			`attachment; filename="command-center-${new Date().toISOString().slice(0, 10)}.zip"`,
		);
		return c.body(archive);
	});
	app.post('/api/v1/backup/restore', async (c) => {
		const body = new Uint8Array(await c.req.arrayBuffer());
		ensure(body.length <= 100 * 1024 * 1024, 413, 'Compressed backup exceeds 100 MB.');
		await mutate(() => restoreBackup(store, body));
		return c.json({ ok: true });
	});
	app.get('/api/v1/changes', (c) =>
		streamSSE(c, async (stream) => {
			let resolveClosed!: () => void;
			const closed = new Promise<void>((resolve) => {
				resolveClosed = resolve;
			});
			const listener = () => {
				void stream
					.writeSSE({ event: 'change', data: String(Date.now()) })
					.catch(() => resolveClosed());
			};
			listeners.add(listener);
			const heartbeat = setInterval(() => {
				void stream.writeSSE({ event: 'ping', data: '' }).catch(() => resolveClosed());
			}, 25000);
			stream.onAbort(resolveClosed);
			await stream.writeSSE({ event: 'ready', data: 'connected' });
			await closed;
			clearInterval(heartbeat);
			listeners.delete(listener);
		}),
	);
	return { app, store, files, notify, schema };
}
