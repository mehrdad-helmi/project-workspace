import { ApiProperty } from '@nestjs/swagger';
import { IntersectionType, OmitType, PartialType } from '@nestjs/swagger';
import {
	IsBoolean,
	IsEnum,
	IsInt,
	IsObject,
	IsOptional,
	IsString,
	IsUUID,
	Max,
	MaxLength,
	Min,
	MinLength,
	ValidateIf,
} from 'class-validator';
import { PositionType } from '@planicam/prisma';
import { PreserveJsonValue } from '../../../../common/validation/json-contract.validators';
import { VersionDto } from '../../../hub/api/dto/hub.dto';
export class CreatePositionDto {
	@ApiProperty({ required: true, type: String })
	@IsUUID()
	projectId!: string;
	@ApiProperty({ required: false, type: String })
	@IsOptional()
	@IsUUID()
	phaseId?: string | null;
	@ApiProperty({ required: true, type: String })
	@IsUUID()
	systemId!: string;
	@ApiProperty({ required: true, type: String })
	@IsString()
	@MinLength(1)
	@MaxLength(255)
	name!: string;
	@ValidateIf((_o: unknown, v: unknown) => v !== undefined)
	@IsEnum(PositionType)
	@ApiProperty({ required: false, type: String })
	type?: PositionType;
	@ApiProperty({ required: false, type: String })
	@IsOptional()
	@IsString()
	@MaxLength(20000)
	briefDescription?: string | null;
	@ApiProperty({ required: false, type: String })
	@IsOptional()
	@IsString()
	@MaxLength(20000)
	modelDescription?: string | null;
}
export class UpdatePositionDto extends IntersectionType(
	PartialType(
		OmitType(CreatePositionDto, ['projectId', 'systemId', 'type'] as const),
		{ skipNullProperties: false },
	),
	VersionDto,
) {}
export class QuantityDto extends VersionDto {
	@ApiProperty({ required: true, type: Number })
	@PreserveJsonValue()
	@IsInt()
	@Min(0)
	@Max(10000)
	quantity!: number;
}
export class AddElementsDto extends VersionDto {
	@ApiProperty({ required: true, type: Number })
	@PreserveJsonValue()
	@IsInt()
	@Min(1)
	@Max(1000)
	count!: number;
}
export class UpdateElementDto extends VersionDto {
	@ApiProperty({ required: false, type: String })
	@IsOptional()
	@IsString()
	@MaxLength(20000)
	description?: string | null;
	@ApiProperty({ required: false, type: String })
	@IsOptional()
	@IsString()
	@MaxLength(255)
	buildingLocation?: string | null;
	@ValidateIf((_o: unknown, v: unknown) => v !== undefined)
	@PreserveJsonValue()
	@IsBoolean()
	@ApiProperty({ required: false, type: Boolean })
	isExcluded?: boolean;
}
export class SavePositionDesignDto extends VersionDto {
	@ApiProperty({ required: true, type: Number })
	@PreserveJsonValue()
	@IsInt()
	@Min(1)
	schemaVersion!: number;
	@ApiProperty({ required: true, type: Object })
	@IsObject()
	@PreserveJsonValue()
	input!: PrismaJson.DeferredEngineeringInput;
}
