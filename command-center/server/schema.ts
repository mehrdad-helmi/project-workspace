import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { getDMMF } from '@prisma/internals';
import type { SchemaGraph, SchemaModel } from '../shared/contracts';

export class SchemaReader {
	private cached?: SchemaGraph;
	constructor(readonly root: string) {}
	async read(): Promise<SchemaGraph> {
		try {
			const files: [string, string][] = [];
			const walk = async (folder: string) => {
				for (const file of await readdir(folder, { withFileTypes: true })) {
					if (file.isSymbolicLink() || file.name === 'migrations') continue;
					const path = join(folder, file.name);
					if (file.isDirectory()) await walk(path);
					else if (file.name.endsWith('.prisma')) files.push([path, await readFile(path, 'utf8')]);
				}
			};
			await walk(this.root);
			const dmmf = await getDMMF({ datamodel: files });
			const models = dmmf.datamodel.models.map((model) => {
				const indexes = dmmf.datamodel.indexes.filter((index) => index.model === model.name);
				return { ...model, indexes } as unknown as SchemaModel;
			});
			this.cached = {
				models,
				enums: dmmf.datamodel.enums.map((item) => ({
					name: item.name,
					values: item.values.map((value) => ({ ...value })),
				})),
				stale: false,
				updatedAt: new Date().toISOString(),
			};
			return this.cached;
		} catch (error) {
			return {
				models: this.cached?.models ?? [],
				enums: this.cached?.enums ?? [],
				updatedAt: this.cached?.updatedAt ?? '',
				stale: true,
				error: error instanceof Error ? error.message : 'Schema could not be parsed.',
			};
		}
	}
}
