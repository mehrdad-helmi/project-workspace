import { Injectable } from '@nestjs/common';
import { PrintoutsRepository } from '../infrastructure/printouts.repository';
@Injectable()
export class PrintoutsService {
	constructor(private readonly repository: PrintoutsRepository) {}
	async listTypes(...args: Parameters<PrintoutsRepository['listTypes']>) {
		const rows = await this.repository.listTypes(...args);
		return rows.map((row) => ({
			...row,
			canGenerate: false,
			badge:
				row.status === 'AVAILABLE'
					? 'Available'
					: row.status === 'NEXT'
						? 'Next'
						: 'Planned',
		}));
	}
}
