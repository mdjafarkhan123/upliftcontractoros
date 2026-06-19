import { SvelteMap } from 'svelte/reactivity';
import type { JobListItem, JobsFilters } from '$lib/types/jobs';

type Status = 'idle' | 'loading' | 'ready' | 'revalidating' | 'error';

type FilterContext = { contact_id: string; contact_name: string } | null;

type CacheEntry = {
	items: JobListItem[];
	nextCursor: string | null;
	filterContext: FilterContext;
	fetchedAt: number;
};

const TTL_MS = 30_000;

const cache = new SvelteMap<string, CacheEntry>();
let currentKey = $state('');
let status = $state<Status>('idle');
let error = $state<string | null>(null);
let activeController: AbortController | null = null;

function buildKey(f: JobsFilters): string {
	return `${f.status}|${f.scope ?? ''}|${f.assignedTo ?? ''}|${f.contactId ?? ''}|${f.search}`;
}

function buildParams(f: JobsFilters, cursor: string | null): URLSearchParams {
	const params = new URLSearchParams();
	if (f.scope) {
		params.set('scope', f.scope);
	} else if (f.status !== 'all') {
		params.set('status', f.status);
	}
	if (f.assignedTo) params.set('assigned_to', f.assignedTo);
	if (f.contactId) params.set('contact_id', f.contactId);
	if (f.search) params.set('q', f.search);
	if (cursor) params.set('cursor', cursor);
	return params;
}

async function fetchPage(
	f: JobsFilters,
	cursor: string | null,
	signal: AbortSignal
): Promise<{ items: JobListItem[]; next_cursor: string | null; filter_context: FilterContext }> {
	const res = await fetch(`/api/jobs?${buildParams(f, cursor).toString()}`, { signal });
	if (!res.ok) throw new Error('Failed to load jobs');
	return (await res.json()) as {
		items: JobListItem[];
		next_cursor: string | null;
		filter_context: FilterContext;
	};
}

export const jobsStore = {
	get items(): JobListItem[] {
		return cache.get(currentKey)?.items ?? [];
	},
	get nextCursor(): string | null {
		return cache.get(currentKey)?.nextCursor ?? null;
	},
	get filterContext(): FilterContext {
		return cache.get(currentKey)?.filterContext ?? null;
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

	/**
	 * Find an already-loaded list row by id across every cached filter key.
	 * Used to seed the detail page header instantly while the full record loads.
	 */
	getById(id: string): JobListItem | null {
		for (const entry of cache.values()) {
			const found = entry.items.find((i) => i.id === id);
			if (found) return found;
		}
		return null;
	},

	async load(filters: JobsFilters, force = false): Promise<void> {
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
			const body = await fetchPage(filters, null, controller.signal);
			cache.set(key, {
				items: body.items,
				nextCursor: body.next_cursor,
				filterContext: body.filter_context,
				fetchedAt: Date.now()
			});
			status = 'ready';
		} catch (e) {
			if ((e as { name?: string })?.name === 'AbortError') return;
			error = e instanceof Error ? e.message : 'Failed to load jobs';
			status = cached ? 'ready' : 'error';
		} finally {
			if (activeController === controller) activeController = null;
		}
	},

	async loadMore(filters: JobsFilters): Promise<void> {
		const key = buildKey(filters);
		const cached = cache.get(key);
		if (!cached?.nextCursor) return;
		const cursor = cached.nextCursor;
		const controller = new AbortController();
		try {
			const body = await fetchPage(filters, cursor, controller.signal);
			cache.set(key, {
				items: [...cached.items, ...body.items],
				nextCursor: body.next_cursor,
				filterContext: cached.filterContext,
				fetchedAt: Date.now()
			});
		} catch {
			// swallow — user can retry
		}
	},

	update(patch: Partial<JobListItem> & { id: string }): void {
		for (const [k, entry] of cache) {
			const idx = entry.items.findIndex((i) => i.id === patch.id);
			if (idx >= 0) {
				const next = entry.items.slice();
				next[idx] = { ...next[idx], ...patch };
				cache.set(k, { ...entry, items: next });
			}
		}
	},

	remove(id: string): void {
		for (const [k, entry] of cache) {
			if (entry.items.some((i) => i.id === id)) {
				cache.set(k, { ...entry, items: entry.items.filter((i) => i.id !== id) });
			}
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
