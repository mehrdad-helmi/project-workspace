import { HubApiResponse } from '../../hub/api/hub-api-response.decorator';
import { HubJsonDataDto } from '../../hub/api/dto/hub-response.dto';
import { Controller, Get, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentActor } from '@planicam/auth';
import type { AuthenticatedActor } from '@planicam/auth';
import { PrintoutsService } from '../application/printouts.service';
import { HubSerializationInterceptor } from '../../hub/api/hub-serialization.interceptor';
@ApiTags('Printouts')
@ApiBearerAuth()
@UseInterceptors(HubSerializationInterceptor)
@Controller('printout-types')
export class PrintoutsController {
	constructor(private readonly service: PrintoutsService) {}
	@HubApiResponse(HubJsonDataDto, 200, true)
	@Get()
	list(@CurrentActor() actor: AuthenticatedActor) {
		return this.service.listTypes(actor);
	}
}
