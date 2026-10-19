import { inject, Injectable } from '@angular/core';
import { requestFailure } from '@planicam/shared/data-access';
import type { MutationResult } from '@planicam/shared/models';
import { catchError, defer, forkJoin, map, of, type Observable } from 'rxjs';
import { HubCatalogGateway } from './hub-catalog.gateway';
import {
	parsePrintoutContext,
	PrintoutContextError,
	type PrintoutSelectionData,
	type PrintoutSelectionQuery,
} from './printout-selection.model';

@Injectable({ providedIn: 'root' })
export class HubPrintoutSelectionService {
	private readonly gateway = inject(HubCatalogGateway);
	load(
		source: PrintoutSelectionQuery,
	): Observable<MutationResult<PrintoutSelectionData>> {
		return defer(() => {
			const context = parsePrintoutContext(source);
			return forkJoin({
				types: this.gateway.printoutTypes(),
				resolution: this.gateway.printoutContext(context),
			}).pipe(
				map((value) => ({
					kind: 'success' as const,
					value: { ...value, context },
				})),
			);
		}).pipe(
			catchError((error) =>
				of({
					kind: 'failure' as const,
					error:
						error instanceof PrintoutContextError
							? { kind: 'validation' as const, message: error.message }
							: requestFailure(error),
				}),
			),
		);
	}
}
