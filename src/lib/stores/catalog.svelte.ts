import type { CatalogItem } from '$lib/types/quotes';

type Status = 'idle' | 'loading' | 'ready' | 'error';

let items = $state<CatalogItem[]>([]);
let status = $state<Status>('idle');
let error = $state<string | null>(null);
let fetchedAt = 0;
const TTL_MS = 60_000;

async function fetchList(): Promise<CatalogItem[]> {
	const res = await fetch('/api/catalog-items');
	if (!res.ok) throw new Error('Failed to load catalog');
	const body = (await res.json()) as { items: CatalogItem[] };
	return body.items;
}

// The catalog is small, so we load it once and let the UI filter in-memory for
// instant search. Stale-while-revalidate: serve cached items immediately, refresh
// in the background.
export const catalogStore = {
	get items() {
		return items;
	},
	get status() {
		return status;
	},
	get error() {
		return error;
	},

	// Distinct, sorted, non-empty category labels — drives the filter chips.
	get categories(): string[] {
		const set = new Set<string>();
		for (const it of items) {
			const c = it.category?.trim();
			if (c) set.add(c);
		}
		return [...set].sort((a, b) => a.localeCompare(b));
	},

	async load(force = false): Promise<void> {
		if (!force && status === 'ready' && Date.now() - fetchedAt < TTL_MS) return;
		status = items.length === 0 ? 'loading' : 'ready';
		error = null;
		try {
			items = await fetchList();
			fetchedAt = Date.now();
			status = 'ready';
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to load catalog';
			if (items.length === 0) status = 'error';
		}
	},

	async refetch(): Promise<void> {
		try {
			items = await fetchList();
			fetchedAt = Date.now();
			status = 'ready';
			error = null;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to load catalog';
		}
	},

	removeLocal(id: string): void {
		items = items.filter((t) => t.id !== id);
	},

	invalidate(): void {
		items = [];
		status = 'idle';
		error = null;
		fetchedAt = 0;
	}
};
