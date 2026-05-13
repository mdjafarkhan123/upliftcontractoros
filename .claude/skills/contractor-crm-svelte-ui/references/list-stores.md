# List Stores — Tabbed / Filtered Lists

> Read this before building any list page that has tabs, filters, or search (contacts, jobs, invoices, quotes, appointments, etc.).

Every list page that filters by tabs/search/etc. **must** use a per-key cached rune store. Never refetch on every tab switch. Never block the UI with a skeleton when a previously-visited filter is being revalidated.

---

## Why this exists

A naive store keeps `items` as a single `$state` array and refetches whenever filters change. That produces two bad UX symptoms:

1. **Skeleton flash on every tab switch** — items are cleared and `status` flips to `loading`, even when the previous tab's data is still valid.
2. **Empty results are never cached** — returning to a tab with zero items refetches every time. The user perceives it as "infinite loading".

The pattern below caches **per filter key** (including empty results), serves cached data instantly, and revalidates stale entries in the background (stale-while-revalidate).

---

## The pattern

Location: `src/lib/stores/<entity>.svelte.ts`

```ts
import { SvelteMap } from 'svelte/reactivity';
import type { Item, Filters } from '$lib/types/...';

type Status = 'idle' | 'loading' | 'ready' | 'revalidating' | 'error';

type CacheEntry = {
  items: Item[];
  nextCursor: string | null;
  fetchedAt: number;
};

const TTL_MS = 30_000;

const cache = new SvelteMap<string, CacheEntry>();
let currentKey = $state('');
let status = $state<Status>('idle');
let error = $state<string | null>(null);
let activeController: AbortController | null = null;

function buildKey(f: Filters): string {
  // Stable string from every filter dimension. Order matters.
  return `${f.tab}|${f.q.trim()}|${f.assignedTo ?? ''}`;
}

async function fetchPage(f: Filters, cursor: string | null, signal: AbortSignal) {
  const res = await fetch(`/api/things?${buildParams(f, cursor)}`, { signal });
  if (!res.ok) throw new Error('Failed to load');
  return (await res.json()) as { items: Item[]; next_cursor: string | null };
}

export const thingsStore = {
  get items() {
    return cache.get(currentKey)?.items ?? [];
  },
  get nextCursor() {
    return cache.get(currentKey)?.nextCursor ?? null;
  },
  get status() { return status; },
  get error() { return error; },

  async load(filters: Filters, force = false) {
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

    // Cold (no cache) → 'loading' (shows skeleton).
    // Warm (cache present) → 'revalidating' (keeps old items visible, no skeleton).
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
      error = e instanceof Error ? e.message : 'Failed to load';
      status = cached ? 'ready' : 'error';
    } finally {
      if (activeController === controller) activeController = null;
    }
  },

  // loadMore, update, remove, invalidate — see contacts.svelte.ts / jobs.svelte.ts.
};
```

### Consumer page

```svelte
<script lang="ts">
  import { thingsStore } from '$lib/stores/things.svelte';

  let tab = $state<TabKey>('all');
  let q = $state('');
  const filters = $derived({ tab, q });

  $effect(() => {
    void thingsStore.load(filters);
  });

  const items = $derived(thingsStore.items);
  const status = $derived(thingsStore.status);
  const errorMsg = $derived(thingsStore.error);

  // Skeleton ONLY on cold load. Revalidation keeps old items visible.
  const showSkeleton = $derived(status === 'loading' && items.length === 0);
  const showError = $derived(status === 'error' && items.length === 0);
</script>

{#if showSkeleton}
  <SkeletonLoader ... />
{:else if showError}
  <p class="text-sm text-destructive">{errorMsg}</p>
{:else if items.length === 0}
  <EmptyState
    icon={Icon}
    title={isFiltered ? 'No matches' : 'No things yet'}
    description={...}
  />
{:else}
  <!-- list -->
{/if}
```

---

## Mandatory rules

1. **Per-key cache** — use `SvelteMap<string, CacheEntry>`. Never a single `$state<Item[]>` array.
2. **`buildKey`** must be deterministic and include every filter dimension. Trim strings before hashing.
3. **Cache empty results** — an empty `items: []` is a valid cache entry. Do NOT skip caching when the result is empty.
4. **Cold vs warm**: cold load (no cache) sets `status='loading'` → page shows skeleton. Warm reload (cache present, TTL expired) sets `status='revalidating'` → page keeps showing old items, no skeleton.
5. **Abort in-flight** — cancel the previous `AbortController` when a new load starts. Ignore `AbortError` in the catch.
6. **Skeleton gate** — page must derive `showSkeleton = status === 'loading' && items.length === 0`. Never gate on `status === 'loading'` alone.
7. **Empty state** — when `items.length === 0` and not loading/error, render `EmptyState` with a tab-aware message. Never leave a blank screen or a stuck skeleton.
8. **Mutations update all keys** — when `update()` / `remove()` runs, iterate `cache` and patch every entry that contains the affected id. Don't only touch the current tab.
9. **`invalidate()` clears the whole map** — used after sign-out or destructive bulk operations.
10. **Module-level `$state`** — the cache and status are module-level rune state (see `feedback_rune_stores_only` memory). Never `writable` from `svelte/store`.

---

## Reference implementations

- `src/lib/stores/contacts.svelte.ts` — search + tab filter
- `src/lib/stores/jobs.svelte.ts` — status + assignee filter

When adding a new tabbed/filtered list route (invoices, quotes, appointments, etc.), copy one of those files and adapt `buildKey`, `buildParams`, the API path, and the item type. Don't reinvent the structure.

`pipelineStore` is **not** a list store — it has no tabs and fetches a single dataset. Single-slot caching is fine there.
