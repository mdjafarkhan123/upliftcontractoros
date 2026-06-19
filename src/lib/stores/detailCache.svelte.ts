import { SvelteMap, SvelteSet } from 'svelte/reactivity';

/**
 * Reusable single-record cache with stale-while-revalidate semantics, keyed by
 * record id. This is the detail-page counterpart to the list stores
 * (`contacts.svelte.ts`, `jobs.svelte.ts`): list stores cache pages per filter
 * key, this caches one record per id.
 *
 * Why it exists: every detail page (`/contacts/[id]`, `/jobs/[id]`, …) used to
 * blank the screen to a full skeleton and refetch from scratch on every visit,
 * remembering nothing. With this cache:
 *  - opening a record you've seen before is instant (served from cache),
 *  - the screen never blanks — callers render a "shell" from list seed data and
 *    swap in the full record when it arrives,
 *  - `prefetch(id)` lets a list row warm the cache on hover / touch-start so the
 *    record is usually loaded before the click even lands.
 *
 * Build one tiny store per domain on top of this factory — see
 * `contactDetail.svelte.ts` for the reference usage.
 */

export type DetailFetcher<T> = (id: string, signal: AbortSignal) => Promise<T>;

type Entry<T> = { data: T; fetchedAt: number };

const DEFAULT_TTL_MS = 30_000;

export function createDetailCache<T>(fetcher: DetailFetcher<T>, ttlMs = DEFAULT_TTL_MS) {
	const cache = new SvelteMap<string, Entry<T>>();
	const inflight = new SvelteSet<string>();
	const errors = new SvelteMap<string, string>();
	// Abort controllers are bookkeeping only — never read in a reactive context,
	// so a plain Map is correct (and avoids spurious re-renders).
	const controllers = new Map<string, AbortController>();

	function isFresh(id: string): boolean {
		const entry = cache.get(id);
		return !!entry && Date.now() - entry.fetchedAt < ttlMs;
	}

	async function run(id: string, force: boolean): Promise<void> {
		if (!force && isFresh(id)) return;
		if (controllers.has(id)) return; // already loading this id

		const controller = new AbortController();
		controllers.set(id, controller);
		inflight.add(id);
		errors.delete(id);

		try {
			const data = await fetcher(id, controller.signal);
			cache.set(id, { data, fetchedAt: Date.now() });
			errors.delete(id);
		} catch (e) {
			if ((e as { name?: string })?.name === 'AbortError') return;
			errors.set(id, e instanceof Error ? e.message : 'Failed to load');
		} finally {
			controllers.delete(id);
			inflight.delete(id);
		}
	}

	return {
		/** Cached record, or `null` if never loaded. */
		get(id: string): T | null {
			return cache.get(id)?.data ?? null;
		},
		/** True only on a cold load (in flight, nothing cached yet) → show a skeleton. */
		isLoading(id: string): boolean {
			return inflight.has(id) && !cache.has(id);
		},
		/** True when refreshing a record that's already on screen → keep showing it. */
		isRevalidating(id: string): boolean {
			return inflight.has(id) && cache.has(id);
		},
		getError(id: string): string | null {
			return errors.get(id) ?? null;
		},

		/** SWR load: serves fresh cache instantly, otherwise fetches. */
		load(id: string, force = false): Promise<void> {
			return run(id, force);
		},

		/** Fire-and-forget warm-up for hover / touch-start. Idempotent. */
		prefetch(id: string): void {
			if (isFresh(id) || controllers.has(id)) return;
			void run(id, false);
		},

		/** Seed or replace a record (e.g. after a successful PATCH returns the row). */
		set(id: string, data: T): void {
			cache.set(id, { data, fetchedAt: Date.now() });
			errors.delete(id);
		},

		/** Patch a cached record in place; no-op if not cached. */
		patch(id: string, updater: (prev: T) => T): void {
			const entry = cache.get(id);
			if (entry) cache.set(id, { data: updater(entry.data), fetchedAt: entry.fetchedAt });
		},

		remove(id: string): void {
			cache.delete(id);
			errors.delete(id);
			controllers.get(id)?.abort();
			controllers.delete(id);
			inflight.delete(id);
		},

		invalidate(): void {
			cache.clear();
			errors.clear();
			for (const controller of controllers.values()) controller.abort();
			controllers.clear();
			inflight.clear();
		}
	};
}
