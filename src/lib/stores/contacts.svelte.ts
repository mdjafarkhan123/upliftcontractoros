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
	statusFilter: 'all' | 'leads' | 'customers';
};

type Status = 'idle' | 'loading' | 'ready' | 'revalidating' | 'error';

const TTL_MS = 30_000;

let items = $state<ContactListItem[]>([]);
let nextCursor = $state<string | null>(null);
let status = $state<Status>('idle');
let error = $state<string | null>(null);
let lastFetchedAt = $state(0);
let lastKey = $state('');
let activeController: AbortController | null = null;

function buildKey(f: ContactsFilters): string {
	return `${f.q.trim()}|${f.statusFilter}`;
}

function buildParams(f: ContactsFilters, cursor: string | null): URLSearchParams {
	const params = new URLSearchParams();
	if (f.q.trim()) params.set('q', f.q.trim());
	if (f.statusFilter !== 'all') params.set('status', f.statusFilter);
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
	get items() {
		return items;
	},
	get nextCursor() {
		return nextCursor;
	},
	get status() {
		return status;
	},
	get error() {
		return error;
	},
	get lastFetchedAt() {
		return lastFetchedAt;
	},

	async load(filters: ContactsFilters, force = false): Promise<void> {
		const key = buildKey(filters);
		const sameKey = key === lastKey;
		const hasCached = sameKey && items.length > 0;
		const fresh = sameKey && hasCached && Date.now() - lastFetchedAt < TTL_MS;
		if (fresh && !force) return;

		if (activeController) activeController.abort();
		const controller = new AbortController();
		activeController = controller;

		if (!sameKey) {
			items = [];
			nextCursor = null;
		}
		status = hasCached ? 'revalidating' : 'loading';
		error = null;
		lastKey = key;

		try {
			const body = await fetchPage(filters, null, controller.signal);
			items = body.items;
			nextCursor = body.next_cursor;
			lastFetchedAt = Date.now();
			status = 'ready';
		} catch (e) {
			if ((e as { name?: string })?.name === 'AbortError') return;
			error = e instanceof Error ? e.message : 'Failed to load contacts';
			status = hasCached ? 'ready' : 'error';
		} finally {
			if (activeController === controller) activeController = null;
		}
	},

	async loadMore(filters: ContactsFilters): Promise<void> {
		if (!nextCursor) return;
		const cursor = nextCursor;
		const controller = new AbortController();
		try {
			const body = await fetchPage(filters, cursor, controller.signal);
			items = [...items, ...body.items];
			nextCursor = body.next_cursor;
		} catch {
			// swallow — user can retry by tapping again
		}
	},

	update(item: ContactListItem): void {
		const idx = items.findIndex((i) => i.id === item.id);
		if (idx >= 0) {
			const next = items.slice();
			next[idx] = item;
			items = next;
		} else {
			items = [item, ...items];
		}
	},

	remove(id: string): void {
		items = items.filter((i) => i.id !== id);
	},

	invalidate(): void {
		items = [];
		nextCursor = null;
		lastFetchedAt = 0;
		status = 'idle';
		lastKey = '';
		if (activeController) {
			activeController.abort();
			activeController = null;
		}
	}
};
