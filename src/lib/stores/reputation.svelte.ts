import { SvelteMap } from 'svelte/reactivity';
import type {
	FunnelPeriod,
	FunnelSummary,
	PrivateFeedbackDetail,
	PrivateFeedbackListItem,
	ReputationSummary,
	ReviewEventListItem,
	ReviewListItem,
	ReviewRequestListItem
} from '$lib/types/reputation';

type Status = 'idle' | 'loading' | 'ready' | 'revalidating' | 'error';

const TTL_MS = 30_000;

type CacheEntry<T> = { items: T[]; fetchedAt: number };

function makeListStore<T>(endpoint: string) {
	let cache = $state<CacheEntry<T> | null>(null);
	let status = $state<Status>('idle');
	let error = $state<string | null>(null);
	let controller: AbortController | null = null;

	return {
		get items(): T[] {
			return cache?.items ?? [];
		},
		get status() {
			return status;
		},
		get error() {
			return error;
		},
		async load(force = false): Promise<void> {
			const fresh = cache && Date.now() - cache.fetchedAt < TTL_MS;
			if (fresh && !force) {
				status = 'ready';
				error = null;
				return;
			}
			if (controller) controller.abort();
			controller = new AbortController();
			status = cache ? 'revalidating' : 'loading';
			error = null;
			try {
				const res = await fetch(endpoint, { signal: controller.signal });
				if (!res.ok) throw new Error(`Failed (${res.status})`);
				const body = (await res.json()) as { items: T[] };
				cache = { items: body.items, fetchedAt: Date.now() };
				status = 'ready';
			} catch (e) {
				if ((e as { name?: string })?.name === 'AbortError') return;
				error = e instanceof Error ? e.message : 'Failed to load';
				status = cache ? 'ready' : 'error';
			} finally {
				controller = null;
			}
		},
		update(patch: Partial<T> & { id: string }): void {
			if (!cache) return;
			const idx = cache.items.findIndex((i) => (i as { id: string }).id === patch.id);
			if (idx >= 0) {
				const next = cache.items.slice();
				next[idx] = { ...next[idx], ...patch } as T;
				cache = { ...cache, items: next };
			}
		},
		invalidate(): void {
			cache = null;
			status = 'idle';
			error = null;
			if (controller) {
				controller.abort();
				controller = null;
			}
		}
	};
}

// Reviews use server-side trigram search (incl. the review body), so unlike the
// other two lists they cache per search term with stale-while-revalidate — each
// term gets its own slot, switching back to a prior term is instant.
function makeSearchableReviewsStore() {
	const cache = new SvelteMap<string, CacheEntry<ReviewListItem>>();
	let currentKey = $state('');
	let status = $state<Status>('idle');
	let error = $state<string | null>(null);
	let controller: AbortController | null = null;

	return {
		get items(): ReviewListItem[] {
			return cache.get(currentKey)?.items ?? [];
		},
		get status() {
			return status;
		},
		get error() {
			return error;
		},
		async load(rawTerm = '', force = false): Promise<void> {
			const term = rawTerm.trim();
			currentKey = term;

			const cached = cache.get(term);
			const fresh = cached && Date.now() - cached.fetchedAt < TTL_MS;
			if (fresh && !force) {
				status = 'ready';
				error = null;
				return;
			}

			if (controller) controller.abort();
			controller = new AbortController();
			status = cached ? 'revalidating' : 'loading';
			error = null;
			try {
				const url = term ? `/api/reviews?q=${encodeURIComponent(term)}` : '/api/reviews';
				const res = await fetch(url, { signal: controller.signal });
				if (!res.ok) throw new Error(`Failed (${res.status})`);
				const body = (await res.json()) as { items: ReviewListItem[] };
				cache.set(term, { items: body.items, fetchedAt: Date.now() });
				status = 'ready';
			} catch (e) {
				if ((e as { name?: string })?.name === 'AbortError') return;
				error = e instanceof Error ? e.message : 'Failed to load';
				status = cached ? 'ready' : 'error';
			} finally {
				controller = null;
			}
		},
		invalidate(): void {
			cache.clear();
			currentKey = '';
			status = 'idle';
			error = null;
			if (controller) {
				controller.abort();
				controller = null;
			}
		}
	};
}

export const reviewsStore = makeSearchableReviewsStore();
export const privateFeedbackStore = makeListStore<PrivateFeedbackListItem>('/api/private-feedback');
export const reviewRequestsStore = makeListStore<ReviewRequestListItem>('/api/review-requests');

let summary = $state<ReputationSummary | null>(null);
let summaryStatus = $state<Status>('idle');
let summaryError = $state<string | null>(null);
let summaryFetchedAt = 0;
let summaryController: AbortController | null = null;

export const reputationSummaryStore = {
	get summary() {
		return summary;
	},
	get status() {
		return summaryStatus;
	},
	get error() {
		return summaryError;
	},
	async load(force = false): Promise<void> {
		const fresh = summary && Date.now() - summaryFetchedAt < TTL_MS;
		if (fresh && !force) {
			summaryStatus = 'ready';
			summaryError = null;
			return;
		}
		if (summaryController) summaryController.abort();
		summaryController = new AbortController();
		summaryStatus = summary ? 'revalidating' : 'loading';
		summaryError = null;
		try {
			const res = await fetch('/api/reputation/summary', { signal: summaryController.signal });
			if (!res.ok) throw new Error(`Failed (${res.status})`);
			const body = (await res.json()) as { data: ReputationSummary };
			summary = body.data;
			summaryFetchedAt = Date.now();
			summaryStatus = 'ready';
		} catch (e) {
			if ((e as { name?: string })?.name === 'AbortError') return;
			summaryError = e instanceof Error ? e.message : 'Failed to load';
			summaryStatus = summary ? 'ready' : 'error';
		} finally {
			summaryController = null;
		}
	},
	invalidate(): void {
		summary = null;
		summaryFetchedAt = 0;
		summaryStatus = 'idle';
		summaryError = null;
		if (summaryController) {
			summaryController.abort();
			summaryController = null;
		}
	}
};

// Funnel summary, keyed by period. Each period caches independently so
// switching back to a previously-viewed window is instant.
type FunnelEntry = { data: FunnelSummary; fetchedAt: number };
const funnelMap = $state<Record<FunnelPeriod, FunnelEntry | null>>({
	'7d': null,
	'30d': null,
	'90d': null
});
const funnelStatus = $state<Record<FunnelPeriod, Status>>({
	'7d': 'idle',
	'30d': 'idle',
	'90d': 'idle'
});
const funnelError = $state<Record<FunnelPeriod, string | null>>({
	'7d': null,
	'30d': null,
	'90d': null
});
const funnelControllers: Record<FunnelPeriod, AbortController | null> = {
	'7d': null,
	'30d': null,
	'90d': null
};

export const reputationFunnelStore = {
	get(period: FunnelPeriod): FunnelSummary | null {
		return funnelMap[period]?.data ?? null;
	},
	getStatus(period: FunnelPeriod): Status {
		return funnelStatus[period];
	},
	getError(period: FunnelPeriod): string | null {
		return funnelError[period];
	},
	async load(period: FunnelPeriod, force = false): Promise<void> {
		const entry = funnelMap[period];
		const fresh = entry && Date.now() - entry.fetchedAt < TTL_MS;
		if (fresh && !force) {
			funnelStatus[period] = 'ready';
			funnelError[period] = null;
			return;
		}
		funnelControllers[period]?.abort();
		const controller = new AbortController();
		funnelControllers[period] = controller;
		funnelStatus[period] = entry ? 'revalidating' : 'loading';
		funnelError[period] = null;
		try {
			const res = await fetch(`/api/reputation/funnel?period=${period}`, {
				signal: controller.signal
			});
			if (!res.ok) throw new Error(`Failed (${res.status})`);
			const body = (await res.json()) as { data: FunnelSummary };
			funnelMap[period] = { data: body.data, fetchedAt: Date.now() };
			funnelStatus[period] = 'ready';
		} catch (e) {
			if ((e as { name?: string })?.name === 'AbortError') return;
			funnelError[period] = e instanceof Error ? e.message : 'Failed to load';
			funnelStatus[period] = funnelMap[period] ? 'ready' : 'error';
		} finally {
			if (funnelControllers[period] === controller) funnelControllers[period] = null;
		}
	}
};

// Per-request event log. Cached per review_request_id; lazily loaded when a
// row is expanded so the list page stays light.
const eventsMap = $state<Record<string, ReviewEventListItem[]>>({});
const eventsStatus = $state<Record<string, Status>>({});
const eventsError = $state<Record<string, string | null>>({});

export const reviewEventsStore = {
	get(id: string): ReviewEventListItem[] {
		return eventsMap[id] ?? [];
	},
	getStatus(id: string): Status {
		return eventsStatus[id] ?? 'idle';
	},
	getError(id: string): string | null {
		return eventsError[id] ?? null;
	},
	async load(id: string, force = false): Promise<void> {
		if (eventsMap[id] && !force) {
			eventsStatus[id] = 'ready';
			eventsError[id] = null;
			return;
		}
		eventsStatus[id] = eventsMap[id] ? 'revalidating' : 'loading';
		eventsError[id] = null;
		try {
			const res = await fetch(`/api/review-requests/${id}/events`);
			if (!res.ok) {
				eventsError[id] = res.status === 404 ? 'Not found' : 'Failed to load';
				eventsStatus[id] = eventsMap[id] ? 'ready' : 'error';
				return;
			}
			const body = (await res.json()) as { items: ReviewEventListItem[] };
			eventsMap[id] = body.items;
			eventsStatus[id] = 'ready';
		} catch (e) {
			eventsError[id] = e instanceof Error ? e.message : 'Failed to load';
			eventsStatus[id] = eventsMap[id] ? 'ready' : 'error';
		}
	},
	invalidate(id: string): void {
		delete eventsMap[id];
		delete eventsStatus[id];
		delete eventsError[id];
	}
};

const detailMap = $state<Record<string, PrivateFeedbackDetail>>({});
const detailStatus = $state<Record<string, Status>>({});
const detailError = $state<Record<string, string | null>>({});

export const privateFeedbackDetailStore = {
	get(id: string): PrivateFeedbackDetail | null {
		return detailMap[id] ?? null;
	},
	getStatus(id: string): Status {
		return detailStatus[id] ?? 'idle';
	},
	getError(id: string): string | null {
		return detailError[id] ?? null;
	},
	async load(id: string, force = false): Promise<void> {
		if (detailMap[id] && !force) {
			detailStatus[id] = 'ready';
			detailError[id] = null;
			return;
		}
		detailStatus[id] = detailMap[id] ? 'revalidating' : 'loading';
		detailError[id] = null;
		try {
			const res = await fetch(`/api/private-feedback/${id}`);
			if (!res.ok) {
				detailError[id] = res.status === 404 ? 'Not found' : 'Failed to load';
				detailStatus[id] = detailMap[id] ? 'ready' : 'error';
				return;
			}
			const body = (await res.json()) as { data: PrivateFeedbackDetail };
			detailMap[id] = body.data;
			detailStatus[id] = 'ready';
		} catch (e) {
			detailError[id] = e instanceof Error ? e.message : 'Failed to load';
			detailStatus[id] = detailMap[id] ? 'ready' : 'error';
		}
	},
	apply(id: string, patch: Partial<PrivateFeedbackDetail>): void {
		const current = detailMap[id];
		if (current) detailMap[id] = { ...current, ...patch };
	}
};
