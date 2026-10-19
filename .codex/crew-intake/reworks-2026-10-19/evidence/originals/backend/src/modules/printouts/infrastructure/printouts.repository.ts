import { Injectable } from '@nestjs/common';
import { DatabaseService } from '@planicam/infra';
import type { HubActor } from '../../hub/types/hub-persistence.types';

@Injectable()
export class PrintoutsRepository {
	constructor(private readonly database: DatabaseService) {}
	async listTypes(_actor: HubActor) {
		const rows = await this.database.printoutType.findMany({
			where: { status: { not: 'DEPRECATED' } },
			orderBy: [{ category: 'asc' }, { name: 'asc' }],
		});
		return rows.map((row) => ({ ...row, canGenerate: false }));
	}
}
