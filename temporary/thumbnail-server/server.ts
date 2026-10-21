import { join } from 'node:path';
import { printoutRequest } from './printouts';

// Temporary development server: placeholder thumbnails and Material Analysis PDFs.
const thumbnails = new Set(['window-1.svg', 'window-2.svg', 'door-1.svg', 'sliding-1.svg', 'curtain-1.svg']);
const headers = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS',
	'Access-Control-Allow-Headers': 'Content-Type',
	'Cache-Control': 'public, max-age=3600',
	'X-Content-Type-Options': 'nosniff',
};
const server = Bun.serve({
	hostname: '127.0.0.1',
	port: 7300,
	maxRequestBodySize: 8 * 1024 * 1024,
	async fetch(request) {
		if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
		const pathname = new URL(request.url).pathname;
		if (pathname === '/printouts' || pathname.startsWith('/printouts/')) {
			return await printoutRequest(request) ?? new Response('Not found', { status: 404, headers });
		}
		if (request.method !== 'GET' && request.method !== 'HEAD') {
			return new Response('Method not allowed', { status: 405, headers: { ...headers, Allow: 'GET, HEAD, OPTIONS' } });
		}
		const filename = pathname.startsWith('/thumbnails/') ? pathname.slice('/thumbnails/'.length) : '';
		if (!thumbnails.has(filename)) return new Response('Not found', { status: 404, headers });
		const file = Bun.file(join(import.meta.dir, 'thumbnails', filename));
		return new Response(request.method === 'HEAD' ? null : file, {
			headers: { ...headers, 'Content-Type': 'image/svg+xml; charset=utf-8' },
		});
	},
});
console.log('Placeholder thumbnails: ' + server.url + 'thumbnails/window-1.svg');

