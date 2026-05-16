import type { QuoteTemplateListItem } from '$lib/types/quotes';

type Status = 'idle' | 'loading' | 'ready' | 'error';

let items = $state<QuoteTemplateListItem[]>([]);
let status = $state<Status>('idle');
let error = $state<string | null>(null);
let fetchedAt = 0;
const TTL_MS = 60_000;

async function fetchList(): Promise<QuoteTemplateListItem[]> {
	const res = await fetch('/api/quote-templates');
	if (!res.ok) throw new Error('Failed to load templates');
	const body = (await res.json()) as { items: QuoteTemplateListItem[] };
	return body.items;
}

export const quoteTemplatesStore = {
	get items() {
		return items;
	},
	get status() {
		return status;
	},
	get error() {
		return error;
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
			error = e instanceof Error ? e.message : 'Failed to load templates';
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
			error = e instanceof Error ? e.message : 'Failed to load templates';
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
