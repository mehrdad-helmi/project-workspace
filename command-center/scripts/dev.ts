import { config } from '../config';
const client = Bun.spawn(['bun', 'x', '--no-install', 'vite', '--host', '127.0.0.1'], {
	cwd: config.appRoot,
	stdout: 'inherit',
	stderr: 'inherit',
});
const server = Bun.spawn(['bun', '--watch', 'server/index.ts'], {
	cwd: config.appRoot,
	env: { ...process.env, CC_DEV: '1' },
	stdout: 'inherit',
	stderr: 'inherit',
});
const stop = () => {
	client.kill();
	server.kill();
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
await Promise.race([client.exited, server.exited]);
stop();
