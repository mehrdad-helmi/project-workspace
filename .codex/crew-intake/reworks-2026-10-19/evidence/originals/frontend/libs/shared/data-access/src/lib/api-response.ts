import { HttpErrorResponse, HttpParams } from '@angular/common/http';
import type {
	CollectionPage,
	CollectionQuery,
	RequestFailure,
} from '@planicam/shared/models';

export function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
export function readApiData<T>(
	response: unknown,
	guard: (value: unknown) => value is T,
): T {
	if (!isRecord(response) || !guard(response['data']))
		throw new Error('Invalid service response');
	return response['data'];
}
export function readCollection<T>(
	response: unknown,
	guard: (value: unknown) => value is T,
): CollectionPage<T> {
	return readApiData(
		response,
		(data): data is CollectionPage<T> =>
			isRecord(data) &&
			Array.isArray(data['items']) &&
			data['items'].every(guard) &&
			typeof data['total'] === 'number' &&
			typeof data['page'] === 'number' &&
			typeof data['pageSize'] === 'number',
	);
}
export function collectionParams(query: CollectionQuery): HttpParams {
	let params = new HttpParams();
	for (const [key, value] of Object.entries(query))
		if (value !== undefined) params = params.set(key, String(value));
	return params;
}
export function requestFailure(error: unknown): RequestFailure {
	if (!(error instanceof HttpErrorResponse))
		return {
			kind: 'unexpected',
			message: 'The service returned an unexpected response. Please try again.',
		};
	const code =
		isRecord(error.error) && typeof error.error['code'] === 'string'
			? error.error['code']
			: undefined;
	if (error.status === 409)
		return {
			kind: 'conflict',
			code,
			message:
				code === 'ELEMENT_SELECTION_REQUIRED'
					? 'Choose the elements to remove before reducing quantity.'
					: 'This record changed. Refresh it and review your changes before saving again.',
		};
	if (error.status === 403)
		return {
			kind: 'authorization',
			message: 'You do not have permission to perform this action.',
		};
	if (error.status === 404)
		return {
			kind: 'not-found',
			message: 'This record is no longer available.',
		};
	if (error.status === 400 || error.status === 422)
		return {
			kind: 'validation',
			code,
			message:
				'Review the entered values. The service could not accept this change.',
		};
	if (error.status === 0 || error.status === 408 || error.status >= 500)
		return {
			kind: 'connectivity',
			message:
				'The change could not be confirmed. Refresh before trying again.',
		};
	return {
		kind: 'unexpected',
		message: 'The request could not be completed. Please try again.',
	};
}
