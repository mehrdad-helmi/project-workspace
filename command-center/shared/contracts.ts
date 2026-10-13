import { z } from 'zod';

export const titleSchema = z.string().trim().min(1).max(200);
export const revisionSchema = z.number().int().positive();
export const tagsSchema = z
	.array(z.string().trim().min(1).max(40))
	.max(30)
	.transform((tags) => [...new Set(tags)]);
export const jobInput = z.object({
	title: titleSchema,
	description: z.string().max(10000).default(''),
});
export const sectionInput = z.object({ title: titleSchema, jobId: z.string().uuid() });
export const taskInput = z.object({
	title: titleSchema,
	description: z.string().max(100000).default(''),
	tags: tagsSchema.default([]),
	sectionId: z.string().uuid(),
	parentId: z.string().uuid().nullable().default(null),
	links: z.array(z.string().max(2000)).max(30).default([]),
});
export const taskPatch = taskInput
	.partial()
	.extend({ revision: revisionSchema, completeAll: z.boolean().optional() });
export const moveInput = z.object({
	revision: revisionSchema,
	sectionId: z.string().uuid(),
	beforeId: z.string().uuid().nullable().optional(),
	completeAll: z.boolean().default(false),
});
export const dateSchema = z
	.string()
	.regex(/^\d{4}-\d{2}-\d{2}$/)
	.refine((date) => {
		const parsed = new Date(`${date}T12:00:00Z`);
		return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === date;
	}, 'Use a valid Gregorian date');
export const eventInput = z.object({
	title: titleSchema,
	description: z.string().max(100000).default(''),
	date: dateSchema,
	color: z.number().int().min(0).max(19),
});
export const fileInput = z.object({
	source: z.enum(['workspace', 'frontend', 'backend', 'notes', 'conclusions']),
	path: z.string().min(1).max(1000),
	content: z.string().max(5_000_000),
	hash: z.string().nullable(),
	title: titleSchema.optional(),
	tags: tagsSchema.optional(),
	approvedAt: dateSchema.optional(),
	sourceChat: z.string().url().nullable().optional(),
});
export type FileSource = z.infer<typeof fileInput>['source'];
export interface Job {
	id: string;
	title: string;
	description: string;
	position: number;
	revision: number;
}
export interface Section {
	id: string;
	jobId: string;
	title: string;
	kind: 'inbox' | 'active' | 'done' | 'custom';
	position: number;
	revision: number;
}
export interface Task {
	id: string;
	jobId: string;
	sectionId: string;
	parentId: string | null;
	title: string;
	description: string;
	tags: string[];
	links: string[];
	position: number;
	revision: number;
	updatedAt: string;
}
export interface CalendarEvent {
	id: string;
	date: string;
	title: string;
	description: string;
	color: number;
	revision: number;
}
export interface Board {
	jobs: Job[];
	sections: Section[];
	tasks: Task[];
}
export interface DocumentItem {
	source: FileSource;
	path: string;
	title: string;
	updatedAt: string;
	id?: string;
	tags?: string[];
	approvedAt?: string;
	sourceChat?: string;
}
export interface DocumentFile extends DocumentItem {
	content: string;
	hash: string;
}
export interface SchemaField {
	name: string;
	type: string;
	kind: string;
	isList: boolean;
	isRequired: boolean;
	isId: boolean;
	isUnique: boolean;
	dbName?: string | null;
	relationName?: string;
	relationFromFields?: string[];
	relationToFields?: string[];
	default?: unknown;
}
export interface SchemaModel {
	name: string;
	sourceFile: string;
	dbName?: string | null;
	fields: SchemaField[];
	primaryKey: unknown;
	uniqueFields: string[][];
	uniqueIndexes: unknown[];
	indexes: unknown[];
}
export interface SchemaGraph {
	models: SchemaModel[];
	enums: { name: string; values: { name: string; dbName?: string | null }[] }[];
	stale: boolean;
	error?: string;
	updatedAt: string;
}
export interface TrashItem {
	id: string;
	kind: string;
	title: string;
	deletedAt: string;
}

export function localDate(now = new Date(), timezone = 'Asia/Tehran') {
	const parts = new Intl.DateTimeFormat('en-CA', {
		timeZone: timezone,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
	}).formatToParts(now);
	return ['year', 'month', 'day']
		.map((key) => parts.find((part) => part.type === key)!.value)
		.join('-');
}
export function addDays(date: string, days: number) {
	const value = new Date(`${date}T12:00:00Z`);
	value.setUTCDate(value.getUTCDate() + days);
	return value.toISOString().slice(0, 10);
}
export function progress(board: Board, id: string) {
	const tasks = board.tasks.filter((task) => task.jobId === id);
	const done = new Set(
		board.sections.filter((section) => section.kind === 'done').map((section) => section.id),
	);
	const completed = tasks.filter((task) => done.has(task.sectionId)).length;
	return {
		total: tasks.length,
		completed,
		remaining: tasks.length - completed,
		percent: tasks.length ? Math.round((completed / tasks.length) * 100) : 0,
	};
}
