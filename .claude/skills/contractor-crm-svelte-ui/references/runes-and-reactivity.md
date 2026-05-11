# Runes & Reactivity Patterns

> Read this before writing any Svelte component. Every component uses these primitives.

---

## Props, State, Derived

```svelte
<script lang="ts">
  // ── Props — always $props(), never export let ─────────────
  let { value, onClose, variant = 'default', children } = $props<{
    value: string;
    onClose: () => void;
    variant?: 'default' | 'success' | 'danger';
    children?: import('svelte').Snippet;
  }>();

  // ── State ──────────────────────────────────────────────────
  let loading = $state(false);
  let items = $state<Contact[]>([]);
  let searchQuery = $state('');

  // ── Derived (simple — single expression) ───────────────────
  let isEmpty = $derived(filteredItems.length === 0 && !loading);

  // ── Derived (multi-step — use $derived.by) ─────────────────
  // NEVER use $effect + $state as a workaround for complex derived values
  let filteredItems = $derived.by(() => {
    const q = searchQuery.toLowerCase();
    const filtered = items.filter(i => i.full_name.toLowerCase().includes(q));
    return filtered.sort((a, b) => a.full_name.localeCompare(b.full_name));
  });
</script>
```

---

## Event Handlers

Lowercase, no `on:` prefix. This is the Svelte 5 way.

```svelte
<button onclick={handleClick}>Click</button>
<input
  type="text"
  oninput={(e) => (searchQuery = e.currentTarget.value)}
  onkeydown={(e) => e.key === 'Enter' && handleSubmit()}
/>
<form onsubmit={(e) => { e.preventDefault(); handleSubmit(); }}>
```

---

## Snippets (replace slots)

### Zero-argument snippets

```svelte
{#snippet header()}
  <h2>Title</h2>
{/snippet}

{@render header()}
{@render children?.()}
```

### Typed snippets with parameters

Use when a component renders caller-defined markup for each item (list rows, table cells,
card content).

```svelte
<!-- DataList.svelte — component that accepts a typed snippet -->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { Contact } from '$lib/types';

  let { items, row } = $props<{
    items: Contact[];
    row: Snippet<[Contact]>;
  }>();
</script>

{#each items as item (item.id)}
  {@render row(item)}
{/each}

<!-- Usage by parent -->
<DataList {items}>
  {#snippet row(contact: Contact)}
    <div class="row">{contact.full_name} — {contact.status}</div>
  {/snippet}
</DataList>
```

---

## Effects

Always return a cleanup function when the effect creates a side effect.

```ts
$effect(() => {
  const id = setInterval(poll, 5000);
  return () => clearInterval(id);
});
```

### `onMount` vs `$effect` — When to Use Each

- **`onMount`** — One-time setup that should never re-run: subscribing to a fixed channel,
  DOM measurements after first paint, initializing a third-party library on a DOM node.
  Runs once after mount. Cleanup returned runs on destroy.

- **`$effect`** — Logic that must re-run when reactive dependencies change: re-subscribing
  when an ID changes, re-fetching when a filter changes, syncing to external state.
  Cleanup runs before the next execution AND on destroy.

- **Never combine both for the same concern** — they both fire on initial mount, causing
  double execution, flickering, and subtle race conditions.

### `untrack()` — Read State Without Creating a Dependency

```ts
import { untrack } from 'svelte';

$effect(() => {
  const id = contact.id; // tracked — effect re-runs when id changes
  const config = untrack(() => appConfig); // read once, NOT tracked
  loadContact(id, config);
});
```

---

## Debug

```ts
$inspect(items, searchQuery); // remove before committing — never in main
```
