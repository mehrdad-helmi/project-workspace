import {
	Injectable,
	BadRequestException,
	ConflictException,
	NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '@planicam/infra';
import { Prisma } from '@planicam/prisma';
import { DateTime } from 'luxon';
import { randomInt } from 'node:crypto';
import {
	allocateNumber,
	allocateNumbers,
	createNumberSequence,
} from '../../numbering';
import type {
	HubActor,
	HubListQuery,
} from '../../hub/types/hub-persistence.types';
import {
	pageArguments,
	sortField,
	pageResult,
	requireProject,
	requirePosition,
	requireVersion,
} from '../../hub/infrastructure/hub-persistence';
import type {
	CreatePositionInput,
	UpdatePositionInput,
	UpdateElementInput,
} from '../types/positions-repository.types';

export const POSITION_THUMBNAIL_KEYS = [
	'window-1',
	'window-2',
	'door-1',
	'sliding-1',
	'curtain-1',
] as const;
const positionInclude = (userId: string) =>
	({
		system: true,
		phase: true,
		project: {
			select: { id: true, name: true, number: true, archivedAt: true },
		},
		favorites: { where: { userId }, select: { userId: true } },
		design: { select: { schemaVersion: true, input: true } },
		_count: {
			select: {
				elements: { where: { deletedAt: null } },
				issues: {
					where: { resolvedAt: null, severity: { in: ['WARNING', 'ERROR'] } },
				},
			},
		},
	}) satisfies Prisma.PositionInclude;

@Injectable()
export class PositionsRepository {
	constructor(private readonly database: DatabaseService) {}

	async list(actor: HubActor, query: HubListQuery) {
		const where: Prisma.PositionWhereInput = {
			organizationId: actor.organizationId,
			deletedAt: null,
			project: { deletedAt: null, archivedAt: null },
			...(query.archive === 'all'
				? {}
				: { archivedAt: query.archive === 'archived' ? { not: null } : null }),
			...(query.projectId ? { projectId: query.projectId } : {}),
			...(query.phaseId
				? { phaseId: query.phaseId === 'none' ? null : query.phaseId }
				: {}),
			...(query.favoritesOnly
				? { favorites: { some: { userId: actor.userId } } }
				: {}),
			...(query.q
				? {
						OR: [
							{ name: { contains: query.q, mode: 'insensitive' } },
							{ number: { contains: query.q, mode: 'insensitive' } },
						],
					}
				: {}),
		};
		const { skip, take, page, pageSize } = pageArguments(query);
		return this.database.runSerializableTransaction(async (tx) => {
			const rows = await tx.position.findMany({
				where,
				skip,
				take,
				orderBy: [
					{
						[sortField(query, [
							'name',
							'number',
							'updatedAt',
							'createdAt',
							'sequence',
							'status',
						])]: query.sortDirection ?? 'desc',
					},
					{ id: 'asc' },
				],
				include: positionInclude(actor.userId),
			});
			const total = await tx.position.count({ where });
			const effective = rows.length
				? await tx.positionElement.groupBy({
						by: ['positionId'],
						where: {
							positionId: { in: rows.map((row) => row.id) },
							deletedAt: null,
							isExcluded: false,
						},
						_count: true,
					})
				: [];
			return pageResult(
				rows.map((row) => {
					const { favorites, _count, ...position } = row;
					return {
						...position,
						quantity: _count.elements,
						warningCount: _count.issues,
						effectiveQuantity:
							effective.find((count) => count.positionId === row.id)?.[
								'_count'
							] ?? 0,
						isFavorite: favorites.length > 0,
						projectArchivedAt: row.project.archivedAt,
					};
				}),
				total,
				page,
				pageSize,
			);
		});
	}

	async findById(actor: HubActor, id: string) {
		const row = await this.database.position.findFirst({
			where: {
				id,
				organizationId: actor.organizationId,
				deletedAt: null,
				project: { deletedAt: null },
			},
			include: {
				...positionInclude(actor.userId),
				design: true,
				elements: { where: { deletedAt: null }, orderBy: { sequence: 'asc' } },
				issues: { where: { resolvedAt: null } },
			},
		});
		if (!row) throw new NotFoundException('Position not found');
		const { favorites, _count, ...position } = row;
		return {
			...position,
			quantity: _count.elements,
			warningCount: _count.issues,
			effectiveQuantity: row.elements.filter((element) => !element.isExcluded)
				.length,
			isFavorite: favorites.length > 0,
			projectArchivedAt: row.project.archivedAt,
		};
	}

	async create(actor: HubActor, input: CreatePositionInput) {
		const row = await this.database.runSerializableTransaction(async (tx) => {
			await requireProject(tx, actor, input.projectId);
			await this.validatePhase(tx, input.projectId, input.phaseId);
			if (
				!(await tx.systemProfile.findUnique({ where: { id: input.systemId } }))
			)
				throw new BadRequestException('System profile is unavailable');
			const numbering = await allocateNumber(tx, {
				organizationId: actor.organizationId,
				projectId: input.projectId,
				type: 'POSITION',
			});
			const position = await tx.position.create({
				data: {
					...input,
					...numbering,
					organizationId: actor.organizationId,
					createdByUserId: actor.userId,
					thumbnailKey:
						POSITION_THUMBNAIL_KEYS[randomInt(POSITION_THUMBNAIL_KEYS.length)],
				},
			});
			await createNumberSequence(tx, {
				organizationId: actor.organizationId,
				positionId: position.id,
				type: 'ELEMENT',
			});
			await this.addElements(tx, actor, position.id, 1);
			await this.activity(
				tx,
				actor,
				position.id,
				'CREATED',
				'Position created',
			);
			return position;
		});
		return this.findById(actor, row.id);
	}

	async update(actor: HubActor, id: string, input: UpdatePositionInput) {
		await this.database.runSerializableTransaction(async (tx) => {
			const row = await requirePosition(tx, actor, id);
			requireVersion(row, input.expectedVersion);
			await this.validatePhase(tx, row.projectId, input.phaseId);
			const { expectedVersion, ...data } = input;
			await tx.position.update({
				where: { id, version: expectedVersion },
				data: { ...data, version: { increment: 1 } },
			});
			await this.activity(
				tx,
				actor,
				id,
				input.phaseId !== undefined && input.phaseId !== row.phaseId
					? 'PHASE_CHANGED'
					: 'METADATA_UPDATED',
				'Position updated',
				{ changedFields: Object.keys(data) },
			);
		});
		return this.findById(actor, id);
	}

	async remove(actor: HubActor, id: string, expectedVersion: number) {
		return this.database.runSerializableTransaction(async (tx) => {
			const row = await requirePosition(tx, actor, id);
			requireVersion(row, expectedVersion);
			const position = await tx.position.update({
				where: { id, version: expectedVersion },
				data: {
					deletedAt: DateTime.utc().toJSDate(),
					version: { increment: 1 },
				},
			});
			await this.activity(tx, actor, id, 'DELETED', 'Position deleted');
			return position;
		});
	}

	async setArchived(
		actor: HubActor,
		id: string,
		input: { expectedVersion: number; archived: boolean },
	) {
		await this.database.runSerializableTransaction(async (tx) => {
			const row = await requirePosition(tx, actor, id, false);
			requireVersion(row, input.expectedVersion);
			if (row.project.archivedAt)
				throw new ConflictException({
					error: { code: 'PROJECT_ARCHIVED' },
					message: 'Archived project cannot be edited',
				});
			await tx.position.update({
				where: { id, version: input.expectedVersion },
				data: {
					archivedAt: input.archived ? DateTime.utc().toJSDate() : null,
					version: { increment: 1 },
				},
			});
			await this.activity(
				tx,
				actor,
				id,
				'METADATA_UPDATED',
				input.archived ? 'Position archived' : 'Position restored',
				{ changedFields: ['archivedAt'] },
			);
		});
		return this.findById(actor, id);
	}

	async setFavorite(actor: HubActor, id: string, isFavorite: boolean) {
		await this.database.runSerializableTransaction(async (tx) => {
			await requirePosition(tx, actor, id, false);
			if (isFavorite)
				await tx.positionFavorite.upsert({
					where: {
						userId_positionId: { userId: actor.userId, positionId: id },
					},
					create: { userId: actor.userId, positionId: id },
					update: {},
				});
			else
				await tx.positionFavorite.deleteMany({
					where: { userId: actor.userId, positionId: id },
				});
		});
		return { id, isFavorite };
	}

	async listElements(actor: HubActor, positionId: string) {
		await requirePosition(this.database, actor, positionId, false);
		return this.database.positionElement.findMany({
			where: { positionId, deletedAt: null },
			orderBy: { sequence: 'asc' },
			include: {
				fabricationBatch: { select: { id: true, name: true, number: true } },
			},
		});
	}

	async createElements(
		actor: HubActor,
		positionId: string,
		input: { expectedVersion: number; count: number },
	) {
		if (!Number.isInteger(input.count) || input.count < 1 || input.count > 1000)
			throw new BadRequestException('Count must be between 1 and 1000');
		await this.database.runSerializableTransaction(async (tx) => {
			const position = await requirePosition(tx, actor, positionId);
			requireVersion(position, input.expectedVersion);
			await this.addElements(tx, actor, positionId, input.count);
			await tx.position.update({
				where: { id: positionId, version: input.expectedVersion },
				data: { version: { increment: 1 } },
			});
			await this.activity(
				tx,
				actor,
				positionId,
				'ELEMENTS_ADDED',
				'Elements added',
				{ affectedElementCount: input.count },
			);
		});
		return this.findById(actor, positionId);
	}

	async setQuantity(
		actor: HubActor,
		positionId: string,
		input: { expectedVersion: number; quantity: number },
	) {
		if (
			!Number.isInteger(input.quantity) ||
			input.quantity < 0 ||
			input.quantity > 10000
		)
			throw new BadRequestException('Quantity must be between 0 and 10000');
		await this.database.runSerializableTransaction(async (tx) => {
			const position = await requirePosition(tx, actor, positionId);
			requireVersion(position, input.expectedVersion);
			const elements = await tx.positionElement.findMany({
				where: { positionId, deletedAt: null },
				orderBy: { sequence: 'desc' },
			});
			const delta = input.quantity - elements.length;
			if (delta === 0) return;
			if (delta > 1000)
				throw new BadRequestException(
					'Add at most 1000 elements per operation',
				);
			if (delta > 0) await this.addElements(tx, actor, positionId, delta);
			else {
				const empty = elements
					.filter(
						(element) =>
							!element.description &&
							!element.buildingLocation &&
							!element.fabricationBatchId &&
							!element.isExcluded,
					)
					.slice(0, -delta);
				if (empty.length < -delta)
					throw new ConflictException({
						error: { code: 'ELEMENT_SELECTION_REQUIRED' },
						message: 'Manage populated elements before reducing quantity',
					});
				await tx.positionElement.updateMany({
					where: { id: { in: empty.map((element) => element.id) } },
					data: {
						deletedAt: DateTime.utc().toJSDate(),
						version: { increment: 1 },
					},
				});
			}
			await tx.position.update({
				where: { id: positionId, version: input.expectedVersion },
				data: { version: { increment: 1 } },
			});
			await this.activity(
				tx,
				actor,
				positionId,
				delta > 0 ? 'ELEMENTS_ADDED' : 'ELEMENTS_REMOVED',
				'Position quantity changed',
				{ affectedElementCount: Math.abs(delta) },
			);
		});
		return this.findById(actor, positionId);
	}

	async updateElement(
		actor: HubActor,
		positionId: string,
		elementId: string,
		input: UpdateElementInput,
	) {
		return this.database.runSerializableTransaction(async (tx) => {
			await requirePosition(tx, actor, positionId);
			const element = await tx.positionElement.findFirst({
				where: { id: elementId, positionId, deletedAt: null },
			});
			if (!element) throw new NotFoundException('Element not found');
			requireVersion(element, input.expectedVersion);
			const { expectedVersion, ...data } = input;
			const updated = await tx.positionElement.update({
				where: { id: elementId, version: expectedVersion },
				data: { ...data, version: { increment: 1 } },
			});
			await tx.position.update({
				where: { id: positionId },
				data: { version: { increment: 1 } },
			});
			await this.activity(
				tx,
				actor,
				positionId,
				input.isExcluded !== undefined &&
					input.isExcluded !== element.isExcluded
					? 'ELEMENT_EXCLUSION_CHANGED'
					: 'ELEMENT_UPDATED',
				'Element updated',
				{ elementIds: [elementId], changedFields: Object.keys(data) },
			);
			return updated;
		});
	}

	async removeElement(
		actor: HubActor,
		positionId: string,
		elementId: string,
		expectedVersion: number,
	) {
		return this.database.runSerializableTransaction(async (tx) => {
			await requirePosition(tx, actor, positionId);
			const element = await tx.positionElement.findFirst({
				where: { id: elementId, positionId, deletedAt: null },
			});
			if (!element) throw new NotFoundException('Element not found');
			requireVersion(element, expectedVersion);
			const updated = await tx.positionElement.update({
				where: { id: elementId, version: expectedVersion },
				data: {
					deletedAt: DateTime.utc().toJSDate(),
					version: { increment: 1 },
				},
			});
			await tx.position.update({
				where: { id: positionId },
				data: { version: { increment: 1 } },
			});
			await this.activity(
				tx,
				actor,
				positionId,
				'ELEMENTS_REMOVED',
				'Element removed',
				{ elementIds: [elementId], affectedElementCount: 1 },
			);
			return updated;
		});
	}

	async listActivities(
		actor: HubActor,
		positionId: string,
		query: HubListQuery,
	) {
		await requirePosition(this.database, actor, positionId, false);
		const { skip, take, page, pageSize } = pageArguments(query);
		const [items, total] = await this.database.$transaction([
			this.database.positionActivity.findMany({
				where: { positionId },
				skip,
				take,
				orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
			}),
			this.database.positionActivity.count({ where: { positionId } }),
		]);
		return pageResult(items, total, page, pageSize);
	}

	initializeDesign(
		actor: HubActor,
		id: string,
		input: {
			expectedVersion: number;
			schemaVersion: number;
			input: PrismaJson.DeferredEngineeringInput;
		},
	) {
		return this.persistDesign(actor, id, input, true);
	}

	saveDesign(
		actor: HubActor,
		id: string,
		input: {
			expectedVersion: number;
			schemaVersion: number;
			input: PrismaJson.DeferredEngineeringInput;
		},
	) {
		return this.persistDesign(actor, id, input, false);
	}

	private async persistDesign(
		actor: HubActor,
		id: string,
		input: {
			expectedVersion: number;
			schemaVersion: number;
			input: PrismaJson.DeferredEngineeringInput;
		},
		initialize: boolean,
	) {
		if (
			!Number.isInteger(input.schemaVersion) ||
			input.schemaVersion < 1 ||
			!input.input ||
			typeof input.input !== 'object' ||
			Array.isArray(input.input)
		)
			throw new BadRequestException(
				'A versioned engineering input object is required',
			);
		await this.database.runSerializableTransaction(async (tx) => {
			const position = await requirePosition(tx, actor, id);
			requireVersion(position, input.expectedVersion);
			const design = await tx.positionDesign.findUnique({
				where: { positionId: id },
			});
			if (initialize && design)
				throw new ConflictException('Position is already initialized');
			if (!initialize && !design)
				throw new ConflictException('Position must be initialized first');
			if (initialize)
				await tx.positionDesign.create({
					data: {
						positionId: id,
						schemaVersion: input.schemaVersion,
						input: input.input,
					},
				});
			else
				await tx.positionDesign.update({
					where: { positionId: id },
					data: { schemaVersion: input.schemaVersion, input: input.input },
				});
			await tx.position.update({
				where: { id, version: input.expectedVersion },
				data: {
					version: { increment: 1 },
					status: 'IN_PROGRESS',
					calculationStatus:
						position.calculationStatus === 'CURRENT'
							? 'STALE'
							: position.calculationStatus,
				},
			});
			await this.activity(
				tx,
				actor,
				id,
				initialize ? 'DESIGN_INITIALIZED' : 'DESIGN_UPDATED',
				initialize ? 'Design initialized' : 'Design saved',
				{ designSchemaVersion: input.schemaVersion },
			);
		});
		return this.findById(actor, id);
	}

	private async validatePhase(
		tx: Prisma.TransactionClient,
		projectId: string,
		phaseId?: string | null,
	) {
		if (
			phaseId &&
			!(await tx.projectPhase.findFirst({ where: { id: phaseId, projectId } }))
		)
			throw new BadRequestException('Phase is unavailable');
	}
	private async addElements(
		tx: Prisma.TransactionClient,
		actor: HubActor,
		positionId: string,
		count: number,
	) {
		const numbers = await allocateNumbers(
			tx,
			{ organizationId: actor.organizationId, positionId, type: 'ELEMENT' },
			count,
		);
		await tx.positionElement.createMany({
			data: numbers.map((numbering) => ({
				organizationId: actor.organizationId,
				positionId,
				...numbering,
			})),
		});
	}
	private activity(
		tx: Prisma.TransactionClient,
		actor: HubActor,
		positionId: string,
		type: Prisma.PositionActivityCreateInput['type'],
		summary: string,
		details?: PrismaJson.PositionActivityDetails,
	) {
		return tx.positionActivity.create({
			data: {
				positionId,
				type,
				summary,
				actorUserId: actor.userId,
				actorDisplayName: actor.displayName,
				details,
			},
		});
	}
}
