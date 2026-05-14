import type { QuoteTemplateListItem } from '$lib/types/quotes';

type Status = 'idle' | 'loading' | 'ready' | 'error';

let items = $state<QuoteTemplateListItem[]>([]);
let status = $state<Status>('idle');
let error = $state<string | null>(null);
let fetchedAt = 0;
const TTL_MS = 60_000;

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
			const res = await fetch('/api/quote-templates');
			if (!res.ok) throw new Error('Failed to load templates');
			const body = (await res.json()) as { items: QuoteTemplateListItem[] };
			items = body.items;
			fetchedAt = Date.now();
			status = 'ready';
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to load templates';
			if (items.length === 0) status = 'error';
		}
	},

	invalidate(): void {
		items = [];
		status = 'idle';
		error = null;
		fetchedAt = 0;
	}
};
