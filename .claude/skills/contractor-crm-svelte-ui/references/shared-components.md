# Shared Components, Toast & Loading States

> Read this before using any shared component or building a data-dependent view.

---

## Toast Notification System — Svelte 5 Runes

File extension must be `.svelte.ts` — this enables `$state` at module scope.
No `writable`, no Svelte 4 stores.

```typescript
// src/lib/stores/toast.svelte.ts
export type ToastVariant = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
  id: string;
  message: string;
  variant: ToastVariant;
  duration: number;
}

let items = $state<Toast[]>([]);

function show(message: string, variant: ToastVariant = 'info', duration = 4000) {
  const id = crypto.randomUUID();
  items.push({ id, message, variant, duration });
  setTimeout(() => dismiss(id), duration);
}

function dismiss(id: string) {
  items = items.filter(t => t.id !== id);
}

export const toast = {
  get items() { return items; },
  success: (msg: string) => show(msg, 'success'),
  error: (msg: string) => show(msg, 'error', 6000),
  warning: (msg: string) => show(msg, 'warning'),
  info: (msg: string) => show(msg, 'info'),
  dismiss,
};
```

```svelte
<!-- src/lib/components/shared/Toaster.svelte -->
<!-- Mount ONCE in (app)/+layout.svelte -->
<script lang="ts">
  import { toast } from '$lib/stores/toast.svelte';
</script>

<div class="toaster" aria-live="polite" aria-atomic="false">
  {#each toast.items as t (t.id)}
    <div
      class="toast"
      data-variant={t.variant}
      role="alert"
    >
      <span>{t.message}</span>
      <button
        class="toast-dismiss"
        onclick={() => toast.dismiss(t.id)}
        aria-label="Dismiss"
      >×</button>
    </div>
  {/each}
</div>
```

Usage anywhere:

```ts
import { toast } from '$lib/stores/toast.svelte';

toast.success('Contact saved');
toast.error('Failed to save. Please try again.');
```

---

## Shared Component API

All shared components are in `src/lib/components/shared/`.

```svelte
<!-- SkeletonLoader — show while fetching data -->
<SkeletonLoader lines={3} height="1.5rem" />
<!-- Props: lines (number), height (CSS string) -->

<!-- EmptyState — when a list has no items -->
<EmptyState
  title="No contacts yet"
  description="Add your first contact to get started."
  actionLabel="Add Contact"
  onAction={() => goto('/contacts/new')}
/>
<!-- Props: title (required), description?, actionLabel?, onAction? -->

<!-- PageWrapper — consistent page padding and title -->
<!-- Children are implicit — nest content directly -->
<PageWrapper title="Contacts" subtitle="Manage your leads and customers">
  <ContactList items={contacts} />
</PageWrapper>
<!-- Props: title (required), subtitle?, children (implicit Snippet) -->

<!-- Badge — status indicators -->
<Badge label="Active" variant="success" />
<Badge label="Overdue" variant="danger" />
<Badge label="Draft" variant="default" />
<!-- Props: label (required), variant: default | success | warning | danger | info -->

<!-- ConfirmDialog — ALL destructive actions must use this. No exceptions. -->
<ConfirmDialog
  bind:open={showDeleteDialog}
  title="Delete Contact"
  description="This action cannot be undone. All related data will be removed."
  confirmLabel="Delete"
  variant="danger"
  onConfirm={handleDelete}
  onCancel={() => (showDeleteDialog = false)}
/>
<!-- Props: bind:open, title, description, confirmLabel, variant?, onConfirm, onCancel? -->
<!-- Trigger by setting open = true from any button or action -->

<!-- BottomSheet — mobile action sheet and secondary nav -->
<BottomSheet bind:open={showMore}>
  <p>Sheet content nested directly — implicit children snippet.</p>
</BottomSheet>
<!-- Props: bind:open, children (implicit Snippet) -->

<!-- Toaster — mount ONCE in (app)/+layout.svelte only -->
<Toaster />
```

---

## Loading, Error, and Pagination States

Every data-dependent view must handle all three states. Copy this structure exactly.

```svelte
<script lang="ts">
  import { goto } from '$app/navigation';
  import SkeletonLoader from '$lib/components/shared/SkeletonLoader.svelte';
  import EmptyState from '$lib/components/shared/EmptyState.svelte';

  let { data } = $props();

  let loading = $state(false);
  let fetchError = $state<string | null>(null);
  let items = $state(data.contacts ?? []);
  let nextCursor = $state<string | null>(data.nextCursor ?? null);

  async function loadMore() {
    if (!nextCursor || loading) return;

    loading = true;
    fetchError = null;

    try {
      const res = await fetch(`/api/contacts?cursor=${nextCursor}`);
      if (!res.ok) throw new Error('Failed to load');
      const json = await res.json();
      items = [...items, ...json.items];
      nextCursor = json.next_cursor ?? null;
    } catch {
      fetchError = 'Could not load contacts. Tap to retry.';
    } finally {
      loading = false;
    }
  }
</script>

{#if loading && items.length === 0}
  <SkeletonLoader lines={5} height="4rem" />
{:else if fetchError && items.length === 0}
  <EmptyState
    title="Something went wrong"
    description={fetchError}
    actionLabel="Retry"
    onAction={loadMore}
  />
{:else if items.length === 0}
  <EmptyState
    title="No contacts yet"
    description="Add your first contact to get started."
    actionLabel="Add Contact"
    onAction={() => goto('/contacts/new')}
  />
{:else}
  {#each items as item (item.id)}
    <!-- list content — always key by item.id -->
  {/each}

  {#if fetchError}
    <p class="load-error">{fetchError} <button onclick={loadMore}>Retry</button></p>
  {:else if nextCursor}
    <button
      class="load-more"
      onclick={loadMore}
      disabled={loading}
    >
      {loading ? 'Loading...' : 'Load more'}
    </button>
  {/if}
{/if}
```

**Rules:**
- Always key `{#each}` blocks with `(item.id)` — never use index as key
- Paginated errors render inline (preserve loaded data), not as a full EmptyState
- Guard `loadMore` with `if (!nextCursor || loading) return` — prevents double calls
