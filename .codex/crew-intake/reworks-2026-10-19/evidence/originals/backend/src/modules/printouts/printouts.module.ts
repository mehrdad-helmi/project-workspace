import { Module } from '@nestjs/common';
import { PrintoutsRepository } from './infrastructure/printouts.repository';
import { PrintoutsService } from './application/printouts.service';
import { PrintoutsController } from './api/printouts.controller';
@Module({
	controllers: [PrintoutsController],
	providers: [PrintoutsRepository, PrintoutsService],
})
export class PrintoutsModule {}
