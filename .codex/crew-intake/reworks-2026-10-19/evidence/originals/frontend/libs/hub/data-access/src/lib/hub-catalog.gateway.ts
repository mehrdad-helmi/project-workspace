import { HttpClient } from '@angular/common/http';
import { inject, Injectable, type Provider } from '@angular/core';
import { isRecord, readApiData } from '@planicam/shared/data-access';
import { map, type Observable } from 'rxjs';
import type {
	Currency,
	CatalogLookup,
	HubOptions,
	PrintoutType,
	SystemProfile,
	ConfigurationRecord,
	ConfigObject,
} from './hub-catalog.model';
import { loadPrintoutContext } from './cloud-printout-context.gateway';
import type {
	PrintoutContextResolution,
	PrintoutSelectionContext,
} from './printout-selection.model';
export abstract class HubCatalogGateway {
	abstract suppliers(): Observable<readonly CatalogLookup[]>;
	abstract discountGroups(
		supplierId?: string,
	): Observable<readonly CatalogLookup[]>;
	abstract vatRates(): Observable<readonly ConfigurationRecord[]>;
	abstract options(): Observable<HubOptions>;
	abstract systems(): Observable<readonly SystemProfile[]>;
	abstract currencies(): Observable<readonly Currency[]>;
	abstract printoutTypes(): Observable<readonly PrintoutType[]>;
	abstract printoutContext(
		context: PrintoutSelectionContext,
	): Observable<PrintoutContextResolution>;
	abstract estimationDataSets(): Observable<readonly ConfigurationRecord[]>;
	abstract configuration(
		path: string,
	): Observable<ConfigurationRecord | readonly ConfigurationRecord[]>;
	abstract saveConfiguration(
		path: string,
		input: ConfigObject,
		method: 'POST' | 'PUT' | 'PATCH' | 'DELETE',
	): Observable<ConfigurationRecord>;
}
function records(v: unknown): v is Record<string, unknown>[] {
	return Array.isArray(v) && v.every(isRecord);
}
@Injectable()
class CloudHubCatalogGateway extends HubCatalogGateway {
	private readonly http = inject(HttpClient);
	private lookup(path: string): Observable<readonly CatalogLookup[]> {
		return this.http
			.get<unknown>('/api/' + path)
			.pipe(
				map((response) =>
					readApiData(
						response,
						(value): value is readonly CatalogLookup[] =>
							records(value) &&
							value.every(
								(row) =>
									typeof row['id'] === 'string' &&
									typeof row['name'] === 'string',
							),
					),
				),
			);
	}
	override suppliers() {
		return this.lookup('suppliers');
	}
	override discountGroups(supplierId?: string) {
		return this.lookup(
			'discount-groups' +
				(supplierId ? '?supplierId=' + encodeURIComponent(supplierId) : ''),
		);
	}
	override vatRates() {
		return this.configuration('organization/vat-rates').pipe(
			map((value) => value as readonly ConfigurationRecord[]),
		);
	}
	override options() {
		return this.http
			.get<unknown>('/api/hub/options')
			.pipe(
				map((r) =>
					readApiData(
						r,
						(v): v is HubOptions =>
							isRecord(v) &&
							Object.values(v).every(
								(x) =>
									Array.isArray(x) &&
									x.every(
										(o) =>
											isRecord(o) &&
											typeof o['value'] === 'string' &&
											typeof o['label'] === 'string',
									),
							),
					),
				),
			);
	}
	override systems() {
		return this.http
			.get<unknown>('/api/system-profiles')
			.pipe(
				map((r) =>
					readApiData(
						r,
						(v): v is readonly SystemProfile[] =>
							records(v) &&
							v.every(
								(x) =>
									typeof x['id'] === 'string' && typeof x['name'] === 'string',
							),
					),
				),
			);
	}
	override currencies() {
		return this.http
			.get<unknown>('/api/currencies')
			.pipe(
				map((r) =>
					readApiData(
						r,
						(v): v is readonly Currency[] =>
							records(v) && v.every((x) => typeof x['code'] === 'string'),
					),
				),
			);
	}
	override printoutTypes() {
		return this.http
			.get<unknown>('/api/printout-types')
			.pipe(
				map((r) =>
					readApiData(
						r,
						(v): v is readonly PrintoutType[] =>
							records(v) &&
							v.every(
								(x) =>
									typeof x['id'] === 'string' &&
									typeof x['name'] === 'string' &&
									typeof x['category'] === 'string' &&
									typeof x['scope'] === 'string' &&
									typeof x['status'] === 'string' &&
									x['canGenerate'] === false,
							),
					),
				),
			);
	}
	override printoutContext(context: PrintoutSelectionContext) {
		return loadPrintoutContext(this.http, context);
	}
	override estimationDataSets() {
		return this.http
			.get<unknown>('/api/organization/estimation-data-sets')
			.pipe(
				map((r) =>
					readApiData(
						r,
						(v): v is readonly ConfigurationRecord[] =>
							records(v) &&
							v.every(
								(x) =>
									typeof x['id'] === 'string' &&
									typeof x['version'] === 'number',
							),
					),
				),
			);
	}
	override configuration(path: string) {
		return this.http
			.get<unknown>('/api/' + path)
			.pipe(
				map(
					(r) =>
						readApiData(
							r,
							(
								v,
							): v is
								| ConfigurationRecord
								| readonly ConfigurationRecord[]
								| null =>
								isRecord(v) ||
								records(v) ||
								(v === null &&
									path.startsWith('organization/labor-hours/systems/')),
						) ?? { id: '', version: 0, overrides: {} },
				),
			);
	}
	override saveConfiguration(
		path: string,
		input: ConfigObject,
		method: 'POST' | 'PUT' | 'PATCH' | 'DELETE',
	) {
		return this.http
			.request<unknown>(method, '/api/' + path, { body: input })
			.pipe(
				map((r) =>
					readApiData(r, (v): v is ConfigurationRecord => isRecord(v)),
				),
			);
	}
}
export function provideCloudHubCatalogGateway(): Provider {
	return { provide: HubCatalogGateway, useClass: CloudHubCatalogGateway };
}
