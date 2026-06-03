import { SvelteMap } from 'svelte/reactivity';

export type ContactListItem = {
	id: string;
	full_name: string;
	phone: string;
	email: string | null;
	status: 'lead' | 'customer' | 'archived';
	lead_source: string;
	assigned_to: string | null;
	sms_opt_out: boolean;
	tags: string[];
	created_at: string;
	assignee_name: string | null;
};

export type ContactsFilters = {
	q: string;
	statusFilter: 'all' | 'leads' | 'customers' | 'archived';
	tag: string;
	scope: 'mine' | 'team' | 'unassigned';
};

type Status = 'idle' | 'loading' | 'ready' | 'revalidating' | 'error';

type CacheEntry = {
	items: ContactListItem[];
	nextCursor: string | null;
	fetchedAt: number;
};

const TTL_MS = 30_000;

const cache = new SvelteMap<string, CacheEntry>();
let currentKey = $state('');
let status = $state<Status>('idle');
let error = $state<string | null>(null);
let activeController: AbortController | null = null;

function buildKey(f: ContactsFilters): string {
	return `${f.q.trim()}|${f.statusFilter}|${f.tag}|${f.scope}`;
}

function buildParams(f: ContactsFilters, cursor: string | null): URLSearchParams {
	const params = new URLSearchParams();
	if (f.q.trim()) params.set('q', f.q.trim());
	if (f.statusFilter !== 'all') params.set('status', f.statusFilter);
	if (f.tag) params.set('tag', f.tag);
	if (f.scope !== 'team') params.set('scope', f.scope);
	if (cursor) params.set('cursor', cursor);
	return params;
}

async function fetchPage(
	f: ContactsFilters,
	cursor: string | null,
	signal: AbortSignal
): Promise<{ items: ContactListItem[]; next_cursor: string | null }> {
	const res = await fetch(`/api/contacts?${buildParams(f, cursor).toString()}`, { signal });
	if (!res.ok) throw new Error('Failed to load contacts');
	return (await res.json()) as { items: ContactListItem[]; next_cursor: string | null };
}

export const contactsStore = {
	get items(): ContactListItem[] {
		return cache.get(currentKey)?.items ?? [];
	},
	get nextCursor(): string | null {
		return cache.get(currentKey)?.nextCursor ?? null;
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

	async load(filters: ContactsFilters, force = false): Promise<void> {
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
				fetchedAt: Date.now()
			});
			status = 'ready';
		} catch (e) {
			if ((e as { name?: string })?.name === 'AbortError') return;
			error = e instanceof Error ? e.message : 'Failed to load contacts';
			status = cached ? 'ready' : 'error';
		} finally {
			if (activeController === controller) activeController = null;
		}
	},

	async loadMore(filters: ContactsFilters): Promise<void> {
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
				fetchedAt: Date.now()
			});
		} catch {
			// swallow — user can retry by tapping again
		}
	},

	update(item: ContactListItem): void {
		for (const [k, entry] of cache) {
			const idx = entry.items.findIndex((i) => i.id === item.id);
			if (idx >= 0) {
				const next = entry.items.slice();
				next[idx] = item;
				cache.set(k, { ...entry, items: next });
			} else if (k === currentKey) {
				cache.set(k, { ...entry, items: [item, ...entry.items] });
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

	removeMany(ids: string[]): void {
		const idSet = new Set(ids);
		for (const [k, entry] of cache) {
			if (entry.items.some((i) => idSet.has(i.id))) {
				cache.set(k, { ...entry, items: entry.items.filter((i) => !idSet.has(i.id)) });
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
