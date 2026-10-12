import { writeFile, chmod } from 'node:fs/promises';
import { join } from 'node:path';
import { emitKeypressEvents } from 'node:readline';
import { config } from '../config';
import { Store } from './database';
import { contentHash } from './files';

async function passwordPrompt(label: string): Promise<string> {
	process.stdout.write(label);
	emitKeypressEvents(process.stdin);
	process.stdin.setRawMode(true);
	process.stdin.resume();
	return new Promise((resolve, reject) => {
		let value = '';
		const listener = (text: string, key: { name?: string; ctrl?: boolean }) => {
			if (key.ctrl && key.name === 'c') {
				clean();
				reject(new Error('Setup cancelled.'));
			} else if (key.name === 'return') {
				clean();
				process.stdout.write('\n');
				resolve(value);
			} else if (key.name === 'backspace') {
				value = value.slice(0, -1);
			} else if (text && !key.ctrl) value += text;
		};
		const clean = () => {
			process.stdin.removeListener('keypress', listener);
			process.stdin.setRawMode(false);
			process.stdin.pause();
		};
		process.stdin.on('keypress', listener);
	});
}
const password = process.argv.includes('--password-stdin')
	? (await Bun.stdin.text()).trim()
	: await passwordPrompt('Owner password (at least 12 characters): ');
if (password.length < 12) throw new Error('Use at least 12 characters.');
if (
	!process.argv.includes('--password-stdin') &&
	password !== (await passwordPrompt('Confirm password: '))
)
	throw new Error('Passwords did not match.');
const store = new Store(config.dataRoot);
const token = crypto.randomUUID() + crypto.randomUUID();
const hash = await Bun.password.hash(password, {
	algorithm: 'argon2id',
	memoryCost: 19456,
	timeCost: 2,
});
store.transaction(() => {
	store.setSetting('passwordHash', hash);
	store.setSetting('agentTokenHash', contentHash(token));
	store.run('DELETE FROM sessions');
});
await writeFile(join(config.dataRoot, 'agent-token'), token, { mode: 0o600 });
await chmod(join(config.dataRoot, 'agent-token'), 0o600);
store.db.close();
console.log('Owner configured. Existing sessions and agent tokens were revoked.');
