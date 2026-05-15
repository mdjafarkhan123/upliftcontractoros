import type { GrowthFeedType } from '$lib/growth/typeRegistry';

export type GrowthFeedItem = {
	id: string;
	type: GrowthFeedType;
	title: string;
	body: string;
	media_url: string | null;
	is_monthly_summary: boolean;
	published_at: string;
};

type Status = 'idle' | 'loading' | 'ready' | 'revalidating' | 'error';

const TTL_MS = 60_000;

let items = $state<GrowthFeedItem[]>([]);
let nextCursor = $state<string | null>(null);
let status = $state<Status>('idle');
let error = $state<string | null>(null);
let lastFetchedAt = $state(0);
let activeController: AbortController | null = null;

async function fetchPage(
	cursor: string | null,
	signal: AbortSignal
): Promise<{ items: GrowthFeedItem[]; next_cursor: string | null }> {
	const params = new URLSearchParams();
	if (cursor) params.set('cursor', cursor);
	const res = await fetch(`/api/growth-feed?${params.toString()}`, { signal });
	const body = (await res.json().catch(() => ({}))) as {
		data?: { items: GrowthFeedItem[]; next_cursor: string | null };
		error?: string;
	};
	if (!res.ok) {
		throw new Error(body.error ?? 'Failed to load growth feed');
	}
	return body.data ?? { items: [], next_cursor: null };
}

export const growthFeedStore = {
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

	async load(force = false): Promise<void> {
		const fresh = items.length > 0 && Date.now() - lastFetchedAt < TTL_MS;
		if (fresh && !force) {
			status = 'ready';
			error = null;
			return;
		}

		if (activeController) activeController.abort();
		const controller = new AbortController();
		activeController = controller;

		status = items.length > 0 ? 'revalidating' : 'loading';
		error = null;

		try {
			const body = await fetchPage(null, controller.signal);
			items = body.items;
			nextCursor = body.next_cursor;
			lastFetchedAt = Date.now();
			status = 'ready';
		} catch (e) {
			if ((e as { name?: string })?.name === 'AbortError') return;
			error = e instanceof Error ? e.message : 'Failed to load growth feed';
			status = items.length > 0 ? 'ready' : 'error';
		} finally {
			if (activeController === controller) activeController = null;
		}
	},

	async loadMore(): Promise<void> {
		if (!nextCursor) return;
		const cursor = nextCursor;
		const controller = new AbortController();
		try {
			const body = await fetchPage(cursor, controller.signal);
			items = [...items, ...body.items];
			nextCursor = body.next_cursor;
		} catch {
			// swallow — user retries by tapping again
		}
	},

	invalidate(): void {
		items = [];
		nextCursor = null;
		status = 'idle';
		error = null;
		lastFetchedAt = 0;
		if (activeController) {
			activeController.abort();
			activeController = null;
		}
	}
};
