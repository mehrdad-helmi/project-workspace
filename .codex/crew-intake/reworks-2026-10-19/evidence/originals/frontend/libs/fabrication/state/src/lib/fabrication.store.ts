import { computed, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
	patchState,
	signalStore,
	withComputed,
	withMethods,
	withState,
} from '@ngrx/signals';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import {
	catchError,
	defaultIfEmpty,
	defer,
	EMPTY,
	finalize,
	map,
	of,
	pipe,
	switchMap,
	tap,
	type Observable,
} from 'rxjs';
import { requestFailure } from '@planicam/shared/data-access';
import type {
	CollectionQuery,
	MutationResult,
	RequestFailure,
} from '@planicam/shared/models';
import {
	FabricationService,
	type FabricationBatch,
	type BatchInput,
	type AssignmentInput,
	type AssignmentResult,
} from '@planicam/fabrication/data-access';
export const FabricationStore = signalStore(
	withState({
		items: [] as readonly FabricationBatch[],
		total: 0,
		query: { page: 1, pageSize: 25 } as CollectionQuery,
		selectedId: null as string | null,
		detail: null as FabricationBatch | null,
		loading: false,
		detailLoading: false,
		saving: false,
		error: null as RequestFailure | null,
	}),
	withComputed((s) => ({
		selected: computed(
			() =>
				s.detail() ?? s.items().find((x) => x.id === s.selectedId()) ?? null,
		),
	})),
	withMethods(
		(
			store,
			service = inject(FabricationService),
			destroyRef = inject(DestroyRef),
		) => {
			const load = rxMethod<CollectionQuery | void>(
				pipe(
					switchMap((query) =>
						defer(() => {
							patchState(store, {
								query: query ?? store.query(),
								loading: true,
								error: null,
							});
							return service.list(store.query()).pipe(
								tap((page) =>
									patchState(store, { items: page.items, total: page.total }),
								),
								catchError((error) => {
									patchState(store, { error: requestFailure(error) });
									return EMPTY;
								}),
								finalize(() => patchState(store, { loading: false })),
							);
						}),
					),
				),
			);
			const select = rxMethod<string | null>(
				pipe(
					switchMap((id) =>
						defer(() => {
							patchState(store, {
								selectedId: id,
								detail: null,
								detailLoading: !!id,
							});
							return id
								? service.detail(id).pipe(
										tap((detail) => patchState(store, { detail })),
										catchError((error) => {
											patchState(store, { error: requestFailure(error) });
											return EMPTY;
										}),
										finalize(() => patchState(store, { detailLoading: false })),
									)
								: EMPTY;
						}),
					),
				),
			);
			function run<T>(
				operation: Observable<T>,
				done: (value: T) => void,
			): Observable<MutationResult<T>> {
				return defer(() => {
					if (store.saving() || destroyRef.destroyed)
						return of({ kind: 'cancelled' } as const);
					patchState(store, { saving: true, error: null });
					return operation.pipe(
						tap(done),
						map((value) => ({ kind: 'success', value }) as const),
						catchError((error) => {
							const failure = requestFailure(error);
							patchState(store, { error: failure });
							return of({ kind: 'failure', error: failure } as const);
						}),
						takeUntilDestroyed(destroyRef),
						defaultIfEmpty({ kind: 'cancelled' } as const),
						finalize(() => patchState(store, { saving: false })),
					);
				});
			}
			return {
				load,
				select,
				archive(
					id: string,
					version: number,
					archived: boolean,
				): Observable<MutationResult<FabricationBatch>> {
					return run(service.archive(id, version, archived), () => {
						load(store.query());
						select(id);
					});
				},
				clearError() {
					patchState(store, { error: null });
				},
				create(
					input: BatchInput,
				): Observable<MutationResult<FabricationBatch>> {
					return run(service.create(input), (value) => {
						load(store.query());
						select(value.id);
					});
				},
				update(
					id: string,
					version: number,
					input: Partial<BatchInput>,
				): Observable<MutationResult<FabricationBatch>> {
					return run(service.update(id, version, input), (value) => {
						load(store.query());
						select(value.id);
					});
				},
				remove(
					id: string,
					version: number,
				): Observable<MutationResult<FabricationBatch>> {
					return run(service.remove(id, version), () => {
						select(null);
						load(store.query());
					});
				},
				assign(
					id: string,
					version: number,
					input: AssignmentInput,
				): Observable<MutationResult<AssignmentResult>> {
					return run(service.assign(id, version, input), () => {
						load(store.query());
						select(id);
					});
				},
				unassign(
					id: string,
					elementId: string,
					version: number,
				): Observable<MutationResult<FabricationBatch>> {
					return run(service.unassign(id, elementId, version), () => {
						load(store.query());
						select(id);
					});
				},
			};
		},
	),
);
