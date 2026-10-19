import type { PositionType } from '@planicam/prisma';

export type CreatePositionInput = {
	projectId: string;
	phaseId?: string | null;
	systemId: string;
	name: string;
	type?: PositionType;
	briefDescription?: string | null;
	modelDescription?: string | null;
};
export type UpdatePositionInput = Partial<
	Pick<
		CreatePositionInput,
		'phaseId' | 'name' | 'briefDescription' | 'modelDescription'
	>
> & { expectedVersion: number };
export type UpdateElementInput = {
	expectedVersion: number;
	description?: string | null;
	buildingLocation?: string | null;
	isExcluded?: boolean;
};
