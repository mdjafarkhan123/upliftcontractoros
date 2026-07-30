import { SvelteMap } from 'svelte/reactivity';
import type { ReminderCalendarItem, RemindersFilters } from '$lib/types/reminders';

// Invoice-reminders calendar store — cloned from `stores/events.svelte.ts` (same SWR
// shape, keyed by window + assignee). Reminders are READ-ONLY on the grid (never dragged),
// so there is no optimisticUpdate move path — only a status patch (complete/reopen) and a
// remove (delete), both applied across every cached window slot so the change shows at once.

type Status = 'idle' | 'loading' | 'ready' | 'revalidating' | 'error';

type CacheEntry = {
	items: ReminderCalendarItem[];
	fetchedAt: number;
};

const TTL_MS = 30_000;

const cache = new SvelteMap<string, CacheEntry>();
let currentKey = $state('');
let status = $state<Status>('idle');
let error = $state<string | null>(null);
let activeController: AbortController | null = null;

function buildKey(f: RemindersFilters): string {
	return `${f.from}|${f.to}|${f.assignedTo ?? ''}`;
}

function buildParams(f: RemindersFilters): URLSearchParams {
	const params = new URLSearchParams();
	params.set('from', f.from);
	params.set('to', f.to);
	if (f.assignedTo) params.set('assigned_to', f.assignedTo);
	return params;
}

async function fetchPage(
	f: RemindersFilters,
	signal: AbortSignal
): Promise<{ items: ReminderCalendarItem[] }> {
	const res = await fetch(`/api/jobs/reminders?${buildParams(f).toString()}`, { signal });
	if (!res.ok) throw new Error('Failed to load reminders');
	return (await res.json()) as { items: ReminderCalendarItem[] };
}

export const remindersStore = {
	get items(): ReminderCalendarItem[] {
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

	async load(filters: RemindersFilters, force = false): Promise<void> {
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
			error = e instanceof Error ? e.message : 'Failed to load reminders';
			status = cached ? 'ready' : 'error';
		} finally {
			if (activeController === controller) activeController = null;
		}
	},

	/**
	 * Patch a reminder's status (complete / reopen) in-place across every cached window slot
	 * so the calendar card re-derives its face immediately. Returns the prior status so the
	 * caller can revert on a failed PATCH, or null if the reminder wasn't cached.
	 */
	optimisticStatus(id: string, next: 'active' | 'completed'): 'active' | 'completed' | null {
		let prev: 'active' | 'completed' | null = null;
		for (const [key, entry] of cache) {
			let changed = false;
			const items = entry.items.map((it) => {
				if (it.id !== id) return it;
				if (prev === null) prev = it.status;
				changed = true;
				return {
					...it,
					status: next,
					// completed_at isn't rendered on the calendar (the face derives from `status`),
					// so we don't fabricate a timestamp — the server sets the real value and a
					// revalidation reconciles it.
					completed_at: next === 'completed' ? it.completed_at : null
				};
			});
			if (changed) cache.set(key, { items, fetchedAt: entry.fetchedAt });
		}
		return prev;
	},

	/**
	 * Drop a deleted reminder from every cached window slot so the card disappears at once
	 * (the server soft-delete already succeeded; a revalidation reconciles).
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
