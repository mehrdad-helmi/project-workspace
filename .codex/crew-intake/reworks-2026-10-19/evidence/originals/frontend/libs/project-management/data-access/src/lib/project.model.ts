import type {
	PricingAdjustment,
	VersionedEntity,
} from '@planicam/shared/models';
export interface ProjectStatistics {
	readonly active: number;
	readonly archived: number;
	readonly favorites: number;
	readonly root: number;
	readonly folders: Readonly<Record<string, number>>;
}
export interface ProjectInput {
	readonly name: string;
	readonly customerId: string;
	readonly positionPrefix: string;
	readonly folderId?: string | null;
	readonly estimationDataSetId?: string;
	readonly responsiblePerson?: string | null;
	readonly conditions?: string | null;
	readonly pricingAdjustments?: readonly PricingAdjustment[] | null;
	readonly otherAddresses?: Readonly<Record<string, string>> | null;
	readonly street?: string | null;
	readonly city?: string | null;
	readonly postalCode?: string | null;
	readonly country?: string | null;
}
export type ProjectUpdate = Partial<
	Omit<ProjectInput, 'positionPrefix' | 'estimationDataSetId'>
>;
export interface Project extends ProjectInput, VersionedEntity {
	readonly number: string;
	readonly customer: {
		readonly id: string;
		readonly name: string;
		readonly number: string;
	};
	readonly archivedAt: string | null;
	readonly isFavorite: boolean;
	readonly positionCount: number;
	readonly phaseCount: number;
	readonly elementCount: number;
	readonly warningCount: number;
	readonly effectiveElementCount: number;
	readonly createdAt: string;
	readonly updatedAt: string;
}
export interface ProjectFolder extends VersionedEntity {
	readonly name: string;
	readonly parentId: string | null;
	readonly updatedAt: string;
}
export interface ProjectPhase extends VersionedEntity {
	readonly name: string;
	readonly number: string;
	readonly projectId: string;
	readonly description: string | null;
	readonly sortOrder: number;
}
export interface PositionInput {
	readonly projectId: string;
	readonly systemId: string;
	readonly name: string;
	readonly phaseId?: string | null;
	readonly type?: string;
	readonly briefDescription?: string | null;
	readonly modelDescription?: string | null;
}
export type PositionUpdate = Partial<
	Pick<
		PositionInput,
		'name' | 'phaseId' | 'briefDescription' | 'modelDescription'
	>
>;
export interface Position extends VersionedEntity, PositionInput {
	readonly number: string;
	readonly type: string;
	readonly status: string;
	readonly calculationStatus: string;
	readonly warningCount: number;
	readonly system: {
		readonly id: string;
		readonly name: string;
		readonly category: string;
	};
	readonly archivedAt: string | null;
	readonly projectArchivedAt: string | null;
	readonly thumbnailKey: string;
	readonly quantity: number;
	readonly effectiveQuantity: number;
	readonly isFavorite: boolean;
	readonly createdAt: string;
	readonly updatedAt: string;
	readonly design?: {
		readonly schemaVersion: number;
		readonly input: Readonly<Record<string, unknown>>;
	} | null;
}
export interface PositionElement extends VersionedEntity {
	readonly positionId: string;
	readonly number: string;
	readonly sequence: number;
	readonly description: string | null;
	readonly buildingLocation: string | null;
	readonly isExcluded: boolean;
	readonly fabricationBatchId: string | null;
	readonly fabricationBatch?: {
		readonly id: string;
		readonly number: string;
		readonly name: string;
	} | null;
}
export type ElementUpdate = Partial<
	Pick<PositionElement, 'description' | 'buildingLocation' | 'isExcluded'>
>;
export interface PositionActivity {
	readonly id: string;
	readonly summary: string;
	readonly type: string;
	readonly actorDisplayName: string | null;
	readonly createdAt: string;
}
