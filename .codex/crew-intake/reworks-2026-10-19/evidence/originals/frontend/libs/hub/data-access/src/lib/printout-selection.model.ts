import type { PrintoutType } from './hub-catalog.model';

export type PrintoutInputType =
	| 'PROJECT'
	| 'PROJECT_PHASE'
	| 'POSITIONS'
	| 'ELEMENTS'
	| 'FABRICATION_BATCH';

/** Retained verbatim alongside the resolved position selection. */
export interface PrintoutSelectionQuery {
	readonly inputType: string | null;
	readonly inputId: string | null;
	readonly inputIds: string | null;
	readonly projectId: string | null;
	readonly positionId: string | null;
}

export interface PrintoutSelectionContext {
	readonly source: PrintoutSelectionQuery;
	readonly inputType: PrintoutInputType | null;
	readonly ids: readonly string[];
	readonly projectId: string | null;
}

export interface PrintoutPosition {
	readonly id: string;
	readonly number: string;
	readonly name: string;
	readonly projectId: string;
	readonly projectName: string;
}

export interface PrintoutContextResolution {
	readonly label: string;
	readonly positions: readonly PrintoutPosition[];
	readonly elementIds: readonly string[];
}

export interface PrintoutSelectionData {
	readonly types: readonly PrintoutType[];
	readonly context: PrintoutSelectionContext;
	readonly resolution: PrintoutContextResolution;
}

export class PrintoutContextError extends Error {}

export function parsePrintoutContext(
	source: PrintoutSelectionQuery,
): PrintoutSelectionContext {
	const types: readonly string[] = [
		'PROJECT',
		'PROJECT_PHASE',
		'POSITIONS',
		'ELEMENTS',
		'FABRICATION_BATCH',
	];
	const uuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
	if (!source.inputType) {
		if (
			source.inputId ||
			source.inputIds ||
			source.projectId ||
			source.positionId
		)
			throw new PrintoutContextError(
				'Choose a valid printout input type for this context.',
			);
		return { source, inputType: null, ids: [], projectId: null };
	}
	if (!types.includes(source.inputType))
		throw new PrintoutContextError(
			'This printout input type is not supported.',
		);
	const inputType = source.inputType as PrintoutInputType;
	if (source.inputId && source.inputIds)
		throw new PrintoutContextError(
			'Provide one input ID or a bulk input list, not both.',
		);
	if (source.inputIds && inputType !== 'POSITIONS' && inputType !== 'ELEMENTS')
		throw new PrintoutContextError(
			'Bulk input IDs apply only to positions or elements.',
		);
	const ids = (source.inputIds ?? source.inputId ?? '')
		.split(',')
		.map((id) => id.trim().toLowerCase());
	if (
		ids.some((id) => !uuid.test(id)) ||
		(!source.inputIds && ids.length !== 1)
	)
		throw new PrintoutContextError(
			'The printout input must contain valid UUIDs.',
		);
	if (source.projectId && !uuid.test(source.projectId))
		throw new PrintoutContextError(
			'The project context must contain a valid UUID.',
		);
	if (source.positionId && !uuid.test(source.positionId))
		throw new PrintoutContextError(
			'The position context must contain a valid UUID.',
		);
	if (inputType === 'PROJECT_PHASE' && !source.projectId)
		throw new PrintoutContextError('Choose the parent project for this phase.');
	if (inputType === 'ELEMENTS' && !source.positionId)
		throw new PrintoutContextError(
			'Choose the parent position for these elements.',
		);
	return {
		source,
		inputType,
		ids: [...new Set(ids)],
		projectId: source.projectId?.toLowerCase() ?? null,
	};
}
