import { SvelteMap } from 'svelte/reactivity';
import type { EventListItem, EventsFilters } from '$lib/types/events';

// Calendar Events store — cloned from `stores/appointments.svelte.ts` (same SWR
// shape) but simpler: an Event has no status/search filter, so the cache key is
// just the window + assignee. Field names differ (start_at/end_at, not
// scheduled_*). Read-only render + create only for now; detail/drag come later.

type Status = 'idle' | 'loading' | 'ready' | 'revalidating' | 'error';

type CacheEntry = {
	items: EventListItem[];
	fetchedAt: number;
};

const TTL_MS = 30_000;

const cache = new SvelteMap<string, CacheEntry>();
let currentKey = $state('');
let status = $state<Status>('idle');
let error = $state<string | null>(null);
let activeController: AbortController | null = null;

function buildKey(f: EventsFilters): string {
	return `${f.from}|${f.to}|${f.assignedTo ?? ''}`;
}

function buildParams(f: EventsFilters): URLSearchParams {
	const params = new URLSearchParams();
	params.set('from', f.from);
	params.set('to', f.to);
	if (f.assignedTo) params.set('assigned_to', f.assignedTo);
	return params;
}

async function fetchPage(
	f: EventsFilters,
	signal: AbortSignal
): Promise<{ items: EventListItem[] }> {
	const res = await fetch(`/api/events?${buildParams(f).toString()}`, { signal });
	if (!res.ok) throw new Error('Failed to load events');
	return (await res.json()) as { items: EventListItem[] };
}

export const eventsStore = {
	get items(): EventListItem[] {
		return cache.get(currentKey)?.items ?? [];
	},
	get status() {
		return status;
	},
	get error() {
		return error;
	},
	get lastFetchedAt() {
		return cache.get(currentKey)?.fetchedAt ?? 0;
	},

	async load(filters: EventsFilters, force = false): Promise<void> {
		const key = buildKey(filters);
		currentKey = key;

		const cached = cache.get(key);
		const fresh = cached && Date.now() - cached.fetchedAt < TTL_MS;
		if (fresh && !force) {
			status = 'ready';
			error = null;
			return;
		}

		if (activeController) activeController.abort();
		const controller = new AbortController();
		activeController = controller;

		status = cached ? 'revalidating' : 'loading';
		error = null;

		try {
			const body = await fetchPage(filters, controller.signal);
			cache.set(key, { items: body.items, fetchedAt: Date.now() });
			status = 'ready';
		} catch (e) {
			if ((e as { name?: string })?.name === 'AbortError') return;
			error = e instanceof Error ? e.message : 'Failed to load events';
			status = cached ? 'ready' : 'error';
		} finally {
			if (activeController === controller) activeController = null;
		}
	},

	/**
	 * Patch an event's schedule in-place across every cached window slot so a future
	 * drag-to-move / resize reflects instantly before the server confirms. Returns the
	 * prior {start_at, end_at, all_day} so the caller can revert on a failed PATCH.
	 * Null if the event wasn't found in any cache slot.
	 */
	optimisticUpdate(
		id: string,
		patch: { start_at: string; end_at: string | null; all_day?: boolean }
	): { start_at: string | null; end_at: string | null; all_day: boolean } | null {
		let prev: { start_at: string | null; end_at: string | null; all_day: boolean } | null = null;
		for (const [key, entry] of cache) {
			let changed = false;
			const items = entry.items.map((it) => {
				if (it.id !== id) return it;
				if (!prev) {
					prev = { start_at: it.start_at, end_at: it.end_at, all_day: it.all_day };
				}
				changed = true;
				return {
					...it,
					start_at: patch.start_at,
					end_at: patch.end_at,
					all_day: patch.all_day ?? it.all_day
				};
			});
			if (changed) cache.set(key, { items, fetchedAt: entry.fetchedAt });
		}
		return prev;
	},

	/**
	 * Drop a deleted event from every cached window slot so the card disappears
	 * instantly (the server soft-delete already succeeded; a revalidation reconciles).
	 */
	removeItem(id: string): void {
		for (const [key, entry] of cache) {
			if (!entry.items.some((it) => it.id === id)) continue;
			cache.set(key, {
				items: entry.items.filter((it) => it.id !== id),
				fetchedAt: entry.fetchedAt
			});
		}
	},

	invalidateList(): void {
		cache.clear();
		currentKey = '';
		status = 'idle';
		error = null;
		if (activeController) {
			activeController.abort();
			activeController = null;
		}
	},

	invalidate(): void {
		cache.clear();
		currentKey = '';
		status = 'idle';
		error = null;
		if (activeController) {
			activeController.abort();
			activeController = null;
		}
	}
};
