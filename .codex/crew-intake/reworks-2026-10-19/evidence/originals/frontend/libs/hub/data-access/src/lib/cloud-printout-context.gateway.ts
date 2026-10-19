import type { HttpClient } from '@angular/common/http';
import {
	collectionParams,
	isRecord,
	readApiData,
	readCollection,
} from '@planicam/shared/data-access';
import type { CollectionPage, CollectionQuery } from '@planicam/shared/models';
import {
	EMPTY,
	expand,
	from,
	map,
	mergeMap,
	of,
	reduce,
	switchMap,
	toArray,
	type Observable,
} from 'rxjs';
import {
	PrintoutContextError,
	type PrintoutContextResolution,
	type PrintoutPosition,
	type PrintoutSelectionContext,
} from './printout-selection.model';

interface PositionResponse {
	readonly id: string;
	readonly number: string;
	readonly name: string;
	readonly projectId: string;
	readonly archivedAt: string | null;
	readonly projectArchivedAt: string | null;
	readonly project: {
		readonly id: string;
		readonly name: string;
		readonly archivedAt: string | null;
	};
}

function isPosition(value: unknown): value is PositionResponse {
	return (
		isRecord(value) &&
		typeof value['id'] === 'string' &&
		typeof value['name'] === 'string' &&
		typeof value['number'] === 'string' &&
		typeof value['projectId'] === 'string' &&
		(value['archivedAt'] === null || typeof value['archivedAt'] === 'string') &&
		(value['projectArchivedAt'] === null ||
			typeof value['projectArchivedAt'] === 'string') &&
		isRecord(value['project']) &&
		typeof value['project']['name'] === 'string'
	);
}

function positionInput(value: PositionResponse): PrintoutPosition {
	return {
		id: value.id,
		number: value.number,
		name: value.name,
		projectId: value.projectId,
		projectName: value.project.name,
	};
}

function allPositions(
	http: HttpClient,
	query: CollectionQuery,
): Observable<readonly PrintoutPosition[]> {
	const page = (number: number): Observable<CollectionPage<PositionResponse>> =>
		http
			.get<unknown>('/api/positions', {
				params: collectionParams({
					...query,
					archive: 'active',
					page: number,
					pageSize: 100,
					sortBy: 'number',
					sortDirection: 'asc',
				}),
			})
			.pipe(
				map((response) => {
					const result = readCollection(response, isPosition);
					if (
						result.page !== number ||
						!Number.isSafeInteger(result.total) ||
						result.total < 0 ||
						!Number.isSafeInteger(result.pageSize) ||
						result.pageSize < 1 ||
						(result.items.length === 0 &&
							(number - 1) * result.pageSize < result.total)
					)
						throw new Error('Invalid position page');
					return result;
				}),
			);
	return page(1).pipe(
		expand((result) =>
			result.page * result.pageSize < result.total
				? page(result.page + 1)
				: EMPTY,
		),
		reduce((positions, result) => {
			for (const value of result.items)
				if (!value.archivedAt && !value.projectArchivedAt)
					positions.set(value.id, positionInput(value));
			return positions;
		}, new Map<string, PrintoutPosition>()),
		map((positions) => [...positions.values()]),
	);
}

function reference(
	http: HttpClient,
	path: string,
	id: string,
): Observable<{
	id: string;
	name: string;
	number: string;
	archivedAt: string | null;
}> {
	return http.get<unknown>(`/api/${path}/${encodeURIComponent(id)}`).pipe(
		map((response) =>
			readApiData(
				response,
				(
					value,
				): value is {
					id: string;
					name: string;
					number: string;
					archivedAt: string | null;
				} =>
					isRecord(value) &&
					value['id'] === id &&
					typeof value['name'] === 'string' &&
					typeof value['number'] === 'string' &&
					(value['archivedAt'] === null ||
						typeof value['archivedAt'] === 'string'),
			),
		),
	);
}

function uniquePositions(
	values: readonly PrintoutPosition[],
): readonly PrintoutPosition[] {
	return [...new Map(values.map((value) => [value.id, value])).values()];
}

export function loadPrintoutContext(
	http: HttpClient,
	context: PrintoutSelectionContext,
): Observable<PrintoutContextResolution> {
	const id = context.ids[0];
	if (!context.inputType)
		return allPositions(http, {}).pipe(
			map((positions) => ({
				label: 'All active positions',
				positions,
				elementIds: [],
			})),
		);
	if (
		context.inputType === 'PROJECT' ||
		context.inputType === 'PROJECT_PHASE'
	) {
		const projectId = context.inputType === 'PROJECT' ? id : context.projectId;
		if (!projectId)
			throw new PrintoutContextError('The parent project is required.');
		return reference(http, 'projects', projectId).pipe(
			switchMap((project) => {
				const phase: Observable<string | null> =
					context.inputType === 'PROJECT_PHASE'
						? http
								.get<unknown>(
									`/api/projects/${encodeURIComponent(projectId)}/phases`,
								)
								.pipe(
									map((response) => {
										const phases = readApiData(
											response,
											(value): value is { id: string; name: string }[] =>
												Array.isArray(value) &&
												value.every(
													(item) =>
														isRecord(item) &&
														typeof item['id'] === 'string' &&
														typeof item['name'] === 'string',
												),
										);
										const selected = phases.find((phase) => phase.id === id);
										if (!selected)
											throw new PrintoutContextError(
												'This phase is unavailable in the selected project.',
											);
										return selected.name;
									}),
								)
						: of(null);
				return phase.pipe(
					switchMap((phaseName) =>
						(project.archivedAt
							? of([] as readonly PrintoutPosition[])
							: allPositions(http, {
									projectId,
									...(context.inputType === 'PROJECT_PHASE'
										? { phaseId: id }
										: {}),
								})
						).pipe(
							map((positions) => ({
								label: `${project.number} · ${project.name}${phaseName ? ` / ${phaseName}` : ''}`,
								positions,
								elementIds: [],
							})),
						),
					),
				);
			}),
		);
	}
	if (context.inputType === 'POSITIONS') {
		return from(context.ids).pipe(
			mergeMap(
				(positionId) =>
					http
						.get<unknown>(`/api/positions/${encodeURIComponent(positionId)}`)
						.pipe(
							map((response) => {
								const position = readApiData(response, isPosition);
								if (
									position.id !== positionId ||
									(context.projectId &&
										position.projectId !== context.projectId)
								)
									throw new PrintoutContextError(
										'A selected position does not belong to this context.',
									);
								return position;
							}),
						),
				6,
			),
			toArray(),
			map((values) => ({
				label: `${context.ids.length} selected position${context.ids.length === 1 ? '' : 's'}`,
				positions: uniquePositions(
					values
						.filter((value) => !value.archivedAt && !value.projectArchivedAt)
						.map(positionInput),
				),
				elementIds: [],
			})),
		);
	}
	if (context.inputType === 'FABRICATION_BATCH') {
		return http
			.get<unknown>(`/api/fabrication-batches/${encodeURIComponent(id)}`)
			.pipe(
				map((response) => {
					const batch = readApiData(
						response,
						(
							value,
						): value is {
							id: string;
							name: string;
							number: string;
							elements: Record<string, unknown>[];
						} =>
							isRecord(value) &&
							value['id'] === id &&
							typeof value['name'] === 'string' &&
							typeof value['number'] === 'string' &&
							Array.isArray(value['elements']) &&
							value['elements'].every(isRecord),
					);
					const positions: PrintoutPosition[] = [];
					const elementIds: string[] = [];
					for (const element of batch.elements) {
						const position = element['position'];
						if (
							typeof element['id'] !== 'string' ||
							typeof element['isExcluded'] !== 'boolean' ||
							!isRecord(position) ||
							typeof position['id'] !== 'string' ||
							typeof position['number'] !== 'string' ||
							typeof position['name'] !== 'string' ||
							!isRecord(position['project']) ||
							typeof position['project']['id'] !== 'string' ||
							typeof position['project']['name'] !== 'string'
						)
							throw new Error('Invalid batch element');
						const project = position['project'];
						if (
							element['isExcluded'] ||
							position['deletedAt'] ||
							position['archivedAt'] ||
							project['deletedAt'] ||
							project['archivedAt']
						)
							continue;
						positions.push({
							id: position['id'],
							number: position['number'],
							name: position['name'],
							projectId: project['id'] as string,
							projectName: project['name'] as string,
						});
						elementIds.push(element['id']);
					}
					return {
						label: `${batch.number} · ${batch.name}`,
						positions: uniquePositions(positions),
						elementIds,
					};
				}),
			);
	}
	const positionId = context.source.positionId?.toLowerCase();
	if (!positionId)
		throw new PrintoutContextError(
			'The parent position is required for these elements.',
		);
	return http
		.get<unknown>(`/api/positions/${encodeURIComponent(positionId)}`)
		.pipe(
			map((response) => {
				const position = readApiData(
					response,
					(
						value,
					): value is PositionResponse & {
						elements: { id: string; isExcluded: boolean }[];
					} =>
						isPosition(value) &&
						isRecord(value) &&
						Array.isArray(value['elements']) &&
						value['elements'].every(
							(element) =>
								isRecord(element) &&
								typeof element['id'] === 'string' &&
								typeof element['isExcluded'] === 'boolean',
						),
				);
				if (
					position.id !== positionId ||
					(context.projectId && position.projectId !== context.projectId)
				)
					throw new PrintoutContextError(
						'The selected position does not belong to this context.',
					);
				if (
					context.ids.some(
						(id) => !position.elements.some((element) => element.id === id),
					)
				)
					throw new PrintoutContextError(
						'A selected element is unavailable in this position.',
					);
				const elementIds =
					position.archivedAt || position.projectArchivedAt
						? []
						: position.elements
								.filter(
									(element) =>
										context.ids.includes(element.id) && !element.isExcluded,
								)
								.map((element) => element.id);
				return {
					label: `${position.number} · ${context.ids.length} selected element${context.ids.length === 1 ? '' : 's'}`,
					positions: elementIds.length ? [positionInput(position)] : [],
					elementIds,
				};
			}),
		);
}
