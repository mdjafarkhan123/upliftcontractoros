import type {
	PrivateFeedbackDetail,
	PrivateFeedbackListItem,
	ReputationSummary,
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

export const reviewsStore = makeListStore<ReviewListItem>('/api/reviews');
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
