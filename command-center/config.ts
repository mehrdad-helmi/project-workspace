import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hostname, networkInterfaces } from 'node:os';

const appRoot = dirname(fileURLToPath(import.meta.url));
export const config = {
	appRoot,
	port: Number(process.env.CC_PORT ?? 7200),
	host: process.env.CC_HOST ?? '0.0.0.0',
	dataRoot: resolve(process.env.CC_DATA_DIR ?? resolve(appRoot, 'data')),
	timezone: 'Asia/Tehran',
	weekStartsOn: 6,
	weekends: [4, 5],
	uploadLimit: 50 * 1024 * 1024,
	sessionDays: 7,
	allowedHosts: (
		process.env.CC_ALLOWED_HOSTS ??
		[
			'localhost',
			'127.0.0.1',
			'planicam.redhat.io',
			hostname(),
			...Object.values(networkInterfaces()).flatMap(
				(items) =>
					items?.filter((item) => item.family === 'IPv4').map((item) => item.address) ?? [],
			),
		].join(',')
	)
		.split(',')
		.map((host) => host.trim().toLowerCase()),
	repositories: {
		workspace: resolve(appRoot, '..'),
		frontend: resolve(appRoot, '../../planicam-frontend'),
		backend: resolve(appRoot, '../../planicam-backend'),
	},
	exclusions: new Set([
		'command-center',
		'node_modules',
		'.git',
		'dist',
		'build',
		'.nx',
		'.cache',
		'coverage',
		'generated',
		'openapi',
		'data',
		'output',
		'.impeccable',
	]),
	colors: [
		'#F08439',
		'#53BC92',
		'#5B95E8',
		'#9768D9',
		'#E35F55',
		'#DDA747',
		'#59B7C4',
		'#C977AA',
		'#91AF58',
		'#7489D5',
		'#CA9474',
		'#72AD9E',
		'#A18AC7',
		'#C4B76B',
		'#729CB2',
		'#BF7C7C',
		'#9EAA78',
		'#B08EBA',
		'#8499A4',
		'#B7A18A',
	],
};
export type AppConfig = typeof config;
