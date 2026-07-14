import { SvelteMap } from 'svelte/reactivity';
import type {
	AppointmentDetail,
	AppointmentListItem,
	AppointmentsFilters,
	AppointmentStatus
} from '$lib/types/appointments';

type Status = 'idle' | 'loading' | 'ready' | 'revalidating' | 'error';

type CacheEntry = {
	items: AppointmentListItem[];
	fetchedAt: number;
};

type DetailEntry = {
	appointment: AppointmentDetail;
	fetchedAt: number;
};

type DetailState = {
	status: Status;
	error: string | null;
};

const TTL_MS = 30_000;

const cache = new SvelteMap<string, CacheEntry>();
const details = new SvelteMap<string, DetailEntry>();
const detailState = new SvelteMap<string, DetailState>();
const detailControllers = new Map<string, AbortController>();
let currentKey = $state('');
let status = $state<Status>('idle');
let error = $state<string | null>(null);
let activeController: AbortController | null = null;

function buildKey(f: AppointmentsFilters): string {
	const search = f.search.trim();
	// While searching, the date window is irrelevant (server ignores it), so it
	// stays out of the cache key — every term gets its own SWR slot.
	return search
		? `q:${search}|${f.status}|${f.assignedTo ?? ''}`
		: `${f.from}|${f.to}|${f.status}|${f.assignedTo ?? ''}`;
}

function buildParams(f: AppointmentsFilters): URLSearchParams {
	const params = new URLSearchParams();
	const search = f.search.trim();
	if (search) {
		params.set('q', search);
	} else {
		params.set('from', f.from);
		params.set('to', f.to);
	}
	if (f.status !== 'all') params.set('status', f.status);
	if (f.assignedTo) params.set('assigned_to', f.assignedTo);
	return params;
}

async function fetchPage(
	f: AppointmentsFilters,
	signal: AbortSignal
): Promise<{ items: AppointmentListItem[] }> {
	const res = await fetch(`/api/appointments?${buildParams(f).toString()}`, { signal });
	if (!res.ok) throw new Error('Failed to load appointments');
	return (await res.json()) as { items: AppointmentListItem[] };
}

export const appointmentsStore = {
	get items(): AppointmentListItem[] {
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

	async load(filters: AppointmentsFilters, force = false): Promise<void> {
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
			error = e instanceof Error ? e.message : 'Failed to load appointments';
			status = cached ? 'ready' : 'error';
		} finally {
			if (activeController === controller) activeController = null;
		}
	},

	getDetail(id: string): AppointmentDetail | null {
		return details.get(id)?.appointment ?? null;
	},

	getDetailStatus(id: string): Status {
		return detailState.get(id)?.status ?? 'idle';
	},

	getDetailError(id: string): string | null {
		return detailState.get(id)?.error ?? null;
	},

	setDetail(appointment: AppointmentDetail): void {
		details.set(appointment.id, { appointment, fetchedAt: Date.now() });
		detailState.set(appointment.id, { status: 'ready', error: null });
	},

	/**
	 * Patch an appointment's schedule in-place across every cached filter slot so
	 * a drag-to-move / drag-to-resize reflects instantly before the server confirms.
	 * Returns the prior {scheduled_start, scheduled_end} so the caller can revert on
	 * a failed PATCH (pass it straight back into optimisticUpdate). Null if not found.
	 */
	optimisticUpdate(
		id: string,
		patch: { scheduled_start: string; scheduled_end: string | null; all_day?: boolean }
	): { scheduled_start: string; scheduled_end: string | null; all_day: boolean } | null {
		let prev: { scheduled_start: string; scheduled_end: string | null; all_day: boolean } | null =
			null;
		for (const [key, entry] of cache) {
			let changed = false;
			const items = entry.items.map((it) => {
				if (it.id !== id) return it;
				if (!prev) {
					prev = {
						scheduled_start: it.scheduled_start,
						scheduled_end: it.scheduled_end,
						all_day: it.all_day
					};
				}
				changed = true;
				return {
					...it,
					scheduled_start: patch.scheduled_start,
					scheduled_end: patch.scheduled_end,
					all_day: patch.all_day ?? it.all_day
				};
			});
			if (changed) cache.set(key, { items, fetchedAt: entry.fetchedAt });
		}
		return prev;
	},

	/**
	 * Patch an appointment's status in-place across every cached filter slot (and the
	 * detail cache if present) so a quick status change from the calendar card popover
	 * restyles the block instantly without a refetch.
	 */
	patchStatus(id: string, status: AppointmentStatus): void {
		for (const [key, entry] of cache) {
			let changed = false;
			const items = entry.items.map((it) => {
				if (it.id !== id) return it;
				changed = true;
				return { ...it, status };
			});
			if (changed) cache.set(key, { items, fetchedAt: entry.fetchedAt });
		}
		const detail = details.get(id);
		if (detail) {
			details.set(id, {
				appointment: { ...detail.appointment, status },
				fetchedAt: detail.fetchedAt
			});
		}
	},

	/**
	 * Warm the detail cache on hover / touch-start. Unlike loadDetail it never
	 * aborts/restarts an in-flight request, so rapid hovers don't churn.
	 */
	prefetchDetail(id: string): void {
		const cached = details.get(id);
		const fresh = cached && Date.now() - cached.fetchedAt < TTL_MS;
		if (fresh || detailControllers.has(id)) return;
		void this.loadDetail(id);
	},

	async loadDetail(id: string, force = false): Promise<void> {
		const cached = details.get(id);
		const fresh = cached && Date.now() - cached.fetchedAt < TTL_MS;
		if (fresh && !force) {
			detailState.set(id, { status: 'ready', error: null });
			return;
		}

		const existing = detailControllers.get(id);
		if (existing) existing.abort();
		const controller = new AbortController();
		detailControllers.set(id, controller);

		detailState.set(id, {
			status: cached ? 'revalidating' : 'loading',
			error: null
		});

		try {
			const res = await fetch(`/api/appointments/${id}`, { signal: controller.signal });
			if (!res.ok) {
				const message = res.status === 404 ? 'Appointment not found' : 'Failed to load';
				detailState.set(id, { status: cached ? 'ready' : 'error', error: message });
				return;
			}
			const body = (await res.json()) as { data: AppointmentDetail };
			details.set(id, { appointment: body.data, fetchedAt: Date.now() });
			detailState.set(id, { status: 'ready', error: null });
		} catch (e) {
			if ((e as { name?: string })?.name === 'AbortError') return;
			detailState.set(id, {
				status: cached ? 'ready' : 'error',
				error: e instanceof Error ? e.message : 'Failed to load'
			});
		} finally {
			if (detailControllers.get(id) === controller) detailControllers.delete(id);
		}
	},

	/**
	 * Clear only the list cache, keeping loaded detail records. Use after a
	 * detail-page mutation so the list refetches on next visit but the open
	 * record stays on screen (the page reads it from the detail cache).
	 */
	invalidateList(): void {
		cache.clear();
		currentKey = '';
		status = 'idle';
		error = null;
		if (activeController) {
			activeController.abort();
			activeController = null;
		}
	},

	invalidate(): void {
		cache.clear();
		details.clear();
		detailState.clear();
		for (const ctrl of detailControllers.values()) ctrl.abort();
		detailControllers.clear();
		currentKey = '';
		status = 'idle';
		error = null;
		if (activeController) {
			activeController.abort();
			activeController = null;
		}
	}
};
