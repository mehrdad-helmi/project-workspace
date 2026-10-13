import { useQuery, useQueryClient } from '@tanstack/react-query';
import type {
	Board,
	CalendarEvent,
	DocumentItem,
	TrashItem,
	RepositoryScope,
} from '../shared/contracts';

export async function api<T>(path: string, options?: RequestInit): Promise<T> {
	const response = await fetch(`/api/v1/${path}`, {
		...options,
		headers: {
			...(options?.body && !(options.body instanceof FormData)
				? { 'Content-Type': 'application/json' }
				: {}),
			...options?.headers,
		},
	});
	if (!response.ok) {
		const body = await response
			.json()
			.catch(() => ({ error: 'The server is unavailable. Try again.' }));
		if (response.status === 401) window.dispatchEvent(new Event('cc:unauthorized'));
		throw new Error(body.error);
	}
	return response.json();
}
export const write = <T = unknown>(path: string, method: string, body?: unknown) =>
	api<T>(path, { method, body: body === undefined ? undefined : JSON.stringify(body) });
export function useBoard() {
	return useQuery({ queryKey: ['board'], queryFn: () => api<Board>('board') });
}
export function useEvents() {
	return useQuery({ queryKey: ['events'], queryFn: () => api<CalendarEvent[]>('events') });
}
export function useDocuments(source?: string, scope?: RepositoryScope) {
	return useQuery({
		queryKey: ['documents', source, scope],
		queryFn: () =>
			api<DocumentItem[]>(
				`documents${source ? `?source=${source}` : ''}${scope ? `&scope=${scope}` : ''}`,
			),
	});
}
export function useTrash() {
	return useQuery({ queryKey: ['trash'], queryFn: () => api<TrashItem[]>('trash') });
}
export function useRefresh() {
	const client = useQueryClient();
	return () => client.invalidateQueries();
}
