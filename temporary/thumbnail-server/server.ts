import { join } from 'node:path';

// Temporary development server: serves fixed placeholder thumbnails only.
const thumbnails = new Set(['window-1.svg', 'window-2.svg', 'door-1.svg', 'sliding-1.svg', 'curtain-1.svg']);
const headers = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
	'Cache-Control': 'public, max-age=3600',
	'X-Content-Type-Options': 'nosniff',
};
const server = Bun.serve({
	hostname: '127.0.0.1',
	port: 7300,
	async fetch(request) {
		if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
		if (request.method !== 'GET' && request.method !== 'HEAD') {
			return new Response('Method not allowed', { status: 405, headers: { ...headers, Allow: 'GET, HEAD, OPTIONS' } });
		}
		const pathname = new URL(request.url).pathname;
		const filename = pathname.startsWith('/thumbnails/') ? pathname.slice('/thumbnails/'.length) : '';
		if (!thumbnails.has(filename)) return new Response('Not found', { status: 404, headers });
		const file = Bun.file(join(import.meta.dir, 'thumbnails', filename));
		return new Response(request.method === 'HEAD' ? null : file, {
			headers: { ...headers, 'Content-Type': 'image/svg+xml; charset=utf-8' },
		});
	},
});
console.log('Placeholder thumbnails: ' + server.url + 'thumbnails/window-1.svg');

