import { join } from 'node:path';
import { watch } from 'chokidar';
import { config } from '../config';
import { createApp } from './app';

const { app, notify, store } = await createApp(config);
app.get('*', async (c) => {
	if (c.req.path.startsWith('/api/')) return c.json({ error: 'Endpoint not found.' }, 404);
	if (process.env.CC_DEV === '1')
		return fetch(`http://127.0.0.1:7201${c.req.path}${new URL(c.req.url).search}`, {
			headers: { accept: c.req.header('accept') ?? '*/*' },
		});
	const relativePath = decodeURIComponent(c.req.path).replace(/^\/+/, '');
	if (relativePath.includes('..') || relativePath.includes('\\'))
		return c.text('Invalid path', 400);
	const file = Bun.file(join(config.appRoot, 'dist', relativePath || 'index.html'));
	return new Response(
		(await file.exists()) ? file : Bun.file(join(config.appRoot, 'dist', 'index.html')),
	);
});
const server = Bun.serve({
	hostname: config.host,
	port: config.port,
	idleTimeout: 60,
	maxRequestBodySize: 100 * 1024 * 1024,
	fetch: (request, server) =>
		app.fetch(request, { remoteAddress: server.requestIP(request)?.address ?? 'unknown' }),
});
const watcher = watch(
	[
		...Object.values(config.repositories),
		join(config.dataRoot, 'notes'),
		join(config.dataRoot, 'conclusions'),
	],
	{
		ignored: (path, stats) =>
			!!stats?.isDirectory() &&
			config.exclusions.has(path.replaceAll('\\', '/').split('/').at(-1)!),
		ignoreInitial: true,
		awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 100 },
	},
);
let timer: ReturnType<typeof setTimeout>;
watcher.on('all', (_event, path) => {
	if (/\.(md|markdown|prisma)$/i.test(path)) {
		clearTimeout(timer);
		timer = setTimeout(notify, 200);
	}
});
console.log(`Planicam Command Center: http://localhost:${server.port}`);
if (!store.setting('passwordHash'))
	console.log('Owner setup required: run bun run setup in another terminal.');
process.on('SIGINT', async () => {
	await watcher.close();
	await server.stop();
	store.db.close();
	process.exit(0);
});
