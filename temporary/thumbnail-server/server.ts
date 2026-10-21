import { mkdir, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { parseDrawing, renderThumbnail } from './thumbnail';
import { printoutRequest } from './printouts';

// Temporary local development storage; keep bound to loopback.
const root = join(import.meta.dir, 'generated');
const placeholders = new Set(['window-1', 'window-2', 'door-1', 'sliding-1', 'curtain-1']);
const variants = ['dark_theme_exterior', 'dark_theme_interior', 'light_theme_exterior', 'light_theme_interior'] as const;
const headers = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS',
	'Access-Control-Allow-Headers': 'Content-Type',
	'Cache-Control': 'no-store',
	'X-Content-Type-Options': 'nosniff',
};
const writes = new Map<string, Promise<void>>();
const server = Bun.serve({
	hostname: '127.0.0.1',
	port: Number(Bun.env['THUMBNAIL_PORT'] ?? 7300),
	maxRequestBodySize: 8 * 1024 * 1024,
	async fetch(request) {
		if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
		const url = new URL(request.url);
		if (url.pathname === '/printouts' || url.pathname.startsWith('/printouts/')) {
			return await printoutRequest(request) ?? new Response('Not found', { status: 404, headers });
		}
		const match = /^\/thumbnails\/([a-zA-Z0-9_-]{1,100})(?:\/(dark_theme_exterior|dark_theme_interior|light_theme_exterior|light_theme_interior)\.svg)?$/.exec(url.pathname);
		if (request.method === 'POST' && match && !match[2]) {
			let body: unknown;
			try { body = await request.json(); } catch { return new Response('Invalid JSON', { status: 400, headers }); }
			const input = body as Record<string, unknown> | null;
			const exterior = parseDrawing(input?.['exterior']);
			const interior = parseDrawing(input?.['interior']);
			if (!exterior || !interior) return new Response('Invalid drawing paths', { status: 400, headers });
			const id = match[1];
			const directory = join(root, id);
			// Serialize per position and publish all four files with one manifest rename.
			const write = (writes.get(id) ?? Promise.resolve()).catch(() => undefined).then(async () => {
				await mkdir(directory, { recursive: true });
				const revision = crypto.randomUUID();
				const staging = join(directory, revision);
				await mkdir(staging);
				let published = false;
				try {
					for (const variant of variants) {
						await Bun.write(join(staging, variant + '.svg'), renderThumbnail(variant.endsWith('interior') ? interior : exterior, variant.startsWith('dark'), variant.endsWith('interior')));
					}
					const manifestPath = join(directory, 'current.json');
					const manifest = Bun.file(manifestPath);
					const previous: string | null = await manifest.exists() ? (await manifest.json()).revision : null;
					const temporary = join(directory, revision + '.json');
					await Bun.write(temporary, JSON.stringify({ revision }));
					await rename(temporary, manifestPath);
					published = true;
					if (previous) await rm(join(directory, previous), { recursive: true, force: true }).catch(() => undefined);
				} catch (error) {
					if (!published) await rm(staging, { recursive: true, force: true });
					throw error;
				}
			});
			writes.set(id, write);
			try {
				await write;
				return new Response(null, { status: 204, headers });
			} catch {
				return new Response('Thumbnail update failed', { status: 500, headers });
			} finally {
				if (writes.get(id) === write) writes.delete(id);
			}
		}
		if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method not allowed', { status: 405, headers });
		if (match?.[2]) {
			// Retry once if a concurrent publication removes the previous generation.
			for (let attempt = 0; attempt < 2; attempt++) {
				try {
					const manifest = Bun.file(join(root, match[1], 'current.json'));
					if (!await manifest.exists()) break;
					const { revision } = await manifest.json();
					const file = Bun.file(join(root, match[1], revision, match[2] + '.svg'));
					return new Response(request.method === 'HEAD' ? null : await file.arrayBuffer(), { headers: { ...headers, 'Content-Type': 'image/svg+xml; charset=utf-8' } });
				} catch { if (attempt === 1) return new Response('Thumbnail read failed', { status: 500, headers }); }
			}
			const fallback = url.searchParams.get('fallback');
			if (fallback && placeholders.has(fallback)) return svg(request, join(import.meta.dir, 'thumbnails', fallback + '.svg'));
		}
		const placeholder = /^\/thumbnails\/([a-z0-9-]+)\.svg$/.exec(url.pathname)?.[1];
		if (placeholder && placeholders.has(placeholder)) return svg(request, join(import.meta.dir, 'thumbnails', placeholder + '.svg'));
		return new Response('Not found', { status: 404, headers });
	},
});
function svg(request: Request, path: string): Response {
	return new Response(request.method === 'HEAD' ? null : Bun.file(path), { headers: { ...headers, 'Content-Type': 'image/svg+xml; charset=utf-8' } });
}
console.log('Temporary thumbnails: ' + server.url);
