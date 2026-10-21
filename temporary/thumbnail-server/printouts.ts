import { mkdir, mkdtemp, readFile, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
	isMaterialAnalysis,
	renderMaterialAnalysis,
} from './material-analysis';

const root = join(import.meta.dir, 'printouts');
const headers = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Expose-Headers': 'Location, Content-Disposition',
	'Cache-Control': 'no-store',
	'X-Content-Type-Options': 'nosniff',
};
let rendering = false;

/** Independent local development storage. Receives calculated data, never credentials or executable HTML. */
export async function printoutRequest(
	request: Request,
): Promise<Response | null> {
	const path = new URL(request.url).pathname;
	if (path === '/printouts') {
		if (request.method !== 'POST')
			return new Response('Method not allowed', {
				status: 405,
				headers: { ...headers, Allow: 'POST, OPTIONS' },
			});
		return save(request);
	}
	if (
		!/^\/printouts\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.pdf$/u.test(
			path,
		)
	)
		return null;
	if (!['GET', 'HEAD'].includes(request.method))
		return new Response('Method not allowed', { status: 405, headers });
	const file = Bun.file(join(root, path.slice('/printouts/'.length)));
	if (!(await file.exists()))
		return new Response('Not found', { status: 404, headers });
	return new Response(request.method === 'HEAD' ? null : file, {
		headers: {
			...headers,
			'Content-Type': 'application/pdf',
			'Content-Disposition': 'inline; filename="material-analysis.pdf"',
		},
	});
}

async function save(request: Request): Promise<Response> {
	if (
		request.headers.get('Content-Type')?.split(';')[0].trim() !==
		'application/json'
	)
		return new Response('Send a Material Analysis JSON document', {
			status: 415,
			headers,
		});
	const origin = request.headers.get('Origin');
	if (origin) {
		try {
			const source = new URL(origin);
			if (
				source.protocol !== 'http:' ||
				!['localhost', '127.0.0.1', '[::1]'].includes(source.hostname)
			)
				return new Response('Origin unavailable', { status: 403, headers });
		} catch {
			return new Response('Invalid origin', { status: 403, headers });
		}
	}
	if (rendering)
		return new Response('A printout is being rendered. Retry shortly.', {
			status: 503,
			headers,
		});
	let input: unknown;
	try {
		input = await request.json();
	} catch {
		return new Response('Invalid JSON', { status: 400, headers });
	}
	if (!isMaterialAnalysis(input))
		return new Response('Invalid Material Analysis document', {
			status: 400,
			headers,
		});
	if (rendering)
		return new Response('A printout is being rendered. Retry shortly.', {
			status: 503,
			headers,
		});
	rendering = true;
	let staging: string | undefined;
	try {
		const browser =
			Bun.env['PRINTOUT_BROWSER_PATH'] ??
			'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
		if (!(await Bun.file(browser).exists()))
			return new Response(
				'PDF browser unavailable. Configure PRINTOUT_BROWSER_PATH.',
				{ status: 503, headers },
			);
		await mkdir(root, { recursive: true });
		staging = await mkdtemp(join(root, '.render-'));
		const html = join(staging, 'source.html'),
			pdf = join(staging, 'output.pdf');
		await Bun.write(html, await renderMaterialAnalysis(input, new Date()));
		const child = Bun.spawn(
			[
				browser,
				'--headless',
				'--disable-gpu',
				'--disable-extensions',
				'--disable-background-networking',
				'--no-first-run',
				'--no-pdf-header-footer',
				`--user-data-dir=${join(staging, 'browser')}`,
				`--print-to-pdf=${pdf}`,
				pathToFileURL(html).href,
			],
			{ stdout: 'ignore', stderr: 'ignore', windowsHide: true },
		);
		const timeout = setTimeout(() => child.kill(), 30000);
		try {
			if ((await child.exited) !== 0 || !(await Bun.file(pdf).exists()))
				throw new Error('PDF renderer failed');
		} finally {
			clearTimeout(timeout);
		}
		const bytes = await readFile(pdf);
		if (bytes.subarray(0, 5).toString() !== '%PDF-')
			throw new Error('Invalid PDF output');
		const id = crypto.randomUUID();
		// Atomic publication: interrupted renders never expose a partial PDF.
		await rename(pdf, join(root, id + '.pdf'));
		return new Response(bytes, {
			status: 201,
			headers: {
				...headers,
				'Content-Type': 'application/pdf',
				'Content-Disposition': 'attachment; filename="material-analysis.pdf"',
				Location: `/printouts/${id}.pdf`,
			},
		});
	} catch {
		return new Response(
			'Material analysis could not be rendered. Retry generation.',
			{ status: 500, headers },
		);
	} finally {
		// mkdtemp always resolves staging below the fixed printouts directory, never from request data.
		if (staging)
			await rm(staging, {
				recursive: true,
				force: true,
				maxRetries: 3,
				retryDelay: 100,
			}).catch(() => undefined);
		rendering = false;
	}
}
