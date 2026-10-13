import { readFile, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { config } from '../config';

const args = process.argv.slice(2).filter((arg) => arg !== '--');
const usage = `Command Center CLI (JSON output)
cc board | documents [source] [conclusion-scope] | folders | events | schema | trash | search <query>
cc read <source> <path>
cc create <jobs|sections|tasks|events> <JSON-or-@file>
cc update <collection> <id> <JSON-or-@file>
cc move-task <id> <JSON-or-@file>
cc delete <collection> <id> <revision>
cc save <JSON-or-@file>                 (document source,path,content,hash + metadata)
cc move-document <JSON-or-@file>        (source,path,to,hash)
cc delete-document <JSON-or-@file>      (source,path,hash)
cc folder <JSON-or-@file>               (action,path,to?)
cc reorder <JSON-or-@file>              (kind,ids,revisions,jobId?)
cc attach <source> <document-path> <local-file>
cc restore-item <trash-id>
cc backup <local-zip-path> | restore-backup <local-zip-path>
Requires the running host. Conclusions require explicit user approval before saving.`;
if (!args.length || args[0] === 'help') {
	console.log(usage);
	process.exit(0);
}
try {
	const token = (await readFile(join(config.dataRoot, 'agent-token'), 'utf8')).trim();
	const input = async (value?: string) => {
		if (!value) throw new Error('JSON input is required.');
		return JSON.parse(value.startsWith('@') ? await readFile(value.slice(1), 'utf8') : value);
	};
	let method = 'GET',
		endpoint = '',
		body: BodyInit | undefined;
	const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
	const [command, first, second, third] = args;
	switch (command) {
		case 'board':
		case 'folders':
		case 'events':
		case 'schema':
		case 'trash':
			endpoint = command;
			break;
		case 'documents':
			endpoint = `documents${first ? `?source=${encodeURIComponent(first)}` : ''}${second ? `&scope=${encodeURIComponent(second)}` : ''}`;
			break;
		case 'search':
			endpoint = `search?q=${encodeURIComponent(args.slice(1).join(' '))}`;
			break;
		case 'read':
			endpoint = `document?source=${encodeURIComponent(first)}&path=${encodeURIComponent(second)}`;
			break;
		case 'create':
			method = 'POST';
			endpoint = first;
			body = JSON.stringify(await input(second));
			break;
		case 'update':
			method = 'PATCH';
			endpoint = `${first}/${second}`;
			body = JSON.stringify(await input(third));
			break;
		case 'move-task':
			method = 'POST';
			endpoint = `tasks/${first}/move`;
			body = JSON.stringify(await input(second));
			break;
		case 'delete':
			method = 'DELETE';
			endpoint = `${first}/${second}?revision=${third}`;
			break;
		case 'save':
			method = 'PUT';
			endpoint = 'document';
			body = JSON.stringify(await input(first));
			break;
		case 'move-document':
		case 'delete-document':
			method = command === 'move-document' ? 'POST' : 'DELETE';
			endpoint = command === 'move-document' ? 'document/move' : 'document';
			body = JSON.stringify(await input(first));
			break;
		case 'folder':
		case 'reorder':
			method = 'POST';
			endpoint = command === 'folder' ? 'folders' : 'reorder';
			body = JSON.stringify(await input(first));
			break;
		case 'restore-item':
			method = 'POST';
			endpoint = `trash/${first}/restore`;
			break;
		case 'attach': {
			method = 'POST';
			endpoint = 'attachments';
			const form = new FormData();
			form.set('source', first);
			form.set('path', second);
			form.set('file', new File([await readFile(third)], basename(third)));
			body = form;
			break;
		}
		case 'backup':
			endpoint = 'backup';
			break;
		case 'restore-backup':
			method = 'POST';
			endpoint = 'backup/restore';
			body = await readFile(first);
			headers['Content-Type'] = 'application/zip';
			break;
		default:
			throw new Error(usage);
	}
	if (typeof body === 'string') headers['Content-Type'] = 'application/json';
	const response = await fetch(`http://127.0.0.1:${config.port}/api/v1/${endpoint}`, {
		method,
		headers,
		body,
	});
	if (!response.ok) {
		console.error(JSON.stringify(await response.json()));
		process.exit(1);
	}
	if (command === 'backup') {
		await writeFile(first, new Uint8Array(await response.arrayBuffer()));
		console.log(JSON.stringify({ saved: first }));
	} else console.log(JSON.stringify(await response.json(), null, 2));
} catch (error) {
	console.error(
		JSON.stringify({
			error: error instanceof Error ? error.message : 'Request failed',
			hint: 'Run bun run setup before first use; the host must be running. See cc help for input shapes.',
		}),
	);
	process.exit(1);
}
