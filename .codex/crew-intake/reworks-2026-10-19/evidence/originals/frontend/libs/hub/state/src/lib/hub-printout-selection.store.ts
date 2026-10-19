import { computed, inject } from '@angular/core';
import {
	patchState,
	signalStore,
	withComputed,
	withMethods,
	withState,
} from '@ngrx/signals';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import {
	HubPrintoutSelectionService,
	type PrintoutContextResolution,
	type PrintoutSelectionContext,
	type PrintoutSelectionQuery,
	type PrintoutType,
} from '@planicam/hub/data-access';
import type { RequestFailure } from '@planicam/shared/models';
import { finalize, pipe, switchMap, tap } from 'rxjs';

export const HubPrintoutSelectionStore = signalStore(
	withState({
		query: null as PrintoutSelectionQuery | null,
		context: null as PrintoutSelectionContext | null,
		resolution: null as PrintoutContextResolution | null,
		types: [] as readonly PrintoutType[],
		selectedReportIds: [] as readonly string[],
		selectedPositionIds: [] as readonly string[],
		loading: false,
		error: null as RequestFailure | null,
		_generation: 0,
	}),
	withComputed((store) => ({
		positions: computed(() => store.resolution()?.positions ?? []),
		selectedReports: computed(() =>
			store
				.types()
				.filter((type) => store.selectedReportIds().includes(type.id)),
		),
	})),
	withMethods((store, service = inject(HubPrintoutSelectionService)) => {
		const request = rxMethod<{
			query: PrintoutSelectionQuery;
			generation: number;
			retainSelection: boolean;
		}>(
			pipe(
				switchMap(({ query, generation, retainSelection }) =>
					service.load(query).pipe(
						tap((result) => {
							if (store._generation() !== generation) return;
							if (result.kind === 'failure') {
								patchState(store, { error: result.error });
								return;
							}
							if (result.kind !== 'success') return;
							const value = result.value;
							patchState(store, {
								context: value.context,
								resolution: value.resolution,
								types: value.types,
								selectedReportIds: retainSelection
									? store
											.selectedReportIds()
											.filter((id) =>
												value.types.some((type) => type.id === id),
											)
									: [],
								selectedPositionIds: retainSelection
									? store
											.selectedPositionIds()
											.filter((id) =>
												value.resolution.positions.some(
													(position) => position.id === id,
												),
											)
									: value.context.inputType
										? value.resolution.positions.map((position) => position.id)
										: [],
							});
						}),
						finalize(() => {
							if (store._generation() === generation)
								patchState(store, { loading: false });
						}),
					),
				),
			),
		);
		return {
			load(query: PrintoutSelectionQuery): void {
				const retainSelection =
					JSON.stringify(store.query()) === JSON.stringify(query) &&
					store.context() !== null;
				const generation = store._generation() + 1;
				patchState(store, {
					query,
					_generation: generation,
					loading: true,
					error: null,
					...(!retainSelection
						? {
								context: null,
								resolution: null,
								types: [],
								selectedReportIds: [],
								selectedPositionIds: [],
							}
						: {}),
				});
				request({ query, generation, retainSelection });
			},
			toggleReport(id: string): void {
				if (store.loading() || !store.types().some((type) => type.id === id))
					return;
				patchState(store, {
					selectedReportIds: store.selectedReportIds().includes(id)
						? store.selectedReportIds().filter((value) => value !== id)
						: [...store.selectedReportIds(), id],
				});
			},
			togglePosition(id: string): void {
				if (
					store.loading() ||
					!store.positions().some((position) => position.id === id)
				)
					return;
				patchState(store, {
					selectedPositionIds: store.selectedPositionIds().includes(id)
						? store.selectedPositionIds().filter((value) => value !== id)
						: [...store.selectedPositionIds(), id],
				});
			},
			selectPositions(ids: readonly string[], selected: boolean): void {
				if (store.loading()) return;
				const allowed = new Set(
					store.positions().map((position) => position.id),
				);
				const requested = ids.filter((id) => allowed.has(id));
				patchState(store, {
					selectedPositionIds: selected
						? [...new Set([...store.selectedPositionIds(), ...requested])]
						: store
								.selectedPositionIds()
								.filter((id) => !requested.includes(id)),
				});
			},
		};
	}),
);
