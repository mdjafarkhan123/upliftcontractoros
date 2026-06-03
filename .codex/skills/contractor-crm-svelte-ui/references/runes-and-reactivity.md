# Runes & Reactivity Patterns

> Read this before writing any Svelte component. Every component uses these primitives.

---

## Props, State, Derived

```svelte
<script lang="ts">
	// ── Props — always $props(), never export let ─────────────
	let {
		value,
		onClose,
		variant = 'default',
		children
	}: {
		value: string;
		onClose: () => void;
		variant?: 'default' | 'success' | 'danger';
		children?: import('svelte').Snippet;
	} = $props();

	// ── State ──────────────────────────────────────────────────
	let loading = $state(false);
	let items = $state<Contact[]>([]);
	let searchQuery = $state('');

	// ── Derived (simple — single expression) ───────────────────
	let isEmpty = $derived(filteredItems.length === 0 && !loading);

	// ── Derived (multi-step — use $derived.by) ─────────────────
	// Use $derived.by() for synchronous multi-step derivations.
	// NEVER use $effect + $state for synchronous derived values — that is always wrong.
	// Exception: async-derived values have no $derived equivalent.
	//   For async derivations, $effect + $state IS the correct pattern, not a workaround:
	//   $effect(() => { fetchSomething(id).then(result => { derivedValue = result; }); });
	let filteredItems = $derived.by(() => {
		const q = searchQuery.toLowerCase();
		const filtered = items.filter((i) => i.full_name.toLowerCase().includes(q));
		return filtered.sort((a, b) => a.full_name.localeCompare(b.full_name));
	});
</script>
```

### Rest Props — Wrapping Native Elements or shadcn Components

```svelte
<!-- InputField.svelte — wraps a native <input> -->
<script lang="ts">
	import { cn } from '$lib/utils';

	let {
		class: className,
		label,
		error,
		...rest // all remaining props passed through to <input>
	}: {
		class?: string;
		label: string;
		error?: string;
		[key: string]: unknown; // index signature required for rest spread to HTML element
	} = $props();
</script>

<div class="flex flex-col gap-1">
	<label class="text-sm font-medium">{label}</label>
	<input class={cn('input-base', className)} {...rest} />
	{#if error}
		<span class="text-sm text-destructive">{error}</span>
	{/if}
</div>
```

---

## Bindable Props

Use `$bindable()` when a parent should be able to use `bind:propName` on a component.

```svelte
<!-- ToggleSwitch.svelte -->
<script lang="ts">
	let {
		checked = $bindable(false),
		disabled = false,
		onchange
	}: {
		checked?: boolean;
		disabled?: boolean;
		onchange?: (value: boolean) => void;
	} = $props();
</script>

<button
	role="switch"
	aria-checked={checked}
	{disabled}
	class="min-h-[44px]"
	onclick={() => {
		checked = !checked;
		onchange?.(checked);
	}}
>
	<span class={checked ? 'translate-x-5' : 'translate-x-0'} />
</button>

<!-- Parent usage -->
<!-- <ToggleSwitch bind:checked={notificationsEnabled} /> -->
```

**Rules:**

- Only declare a prop as `$bindable()` when two-way binding genuinely makes sense (toggles, inputs, dialogs open state, controlled form fields).
- Always provide a default value inside `$bindable(defaultValue)`.
- Callback prop (`onchange`) is still recommended alongside `$bindable()` for side-effect notifications.
- Never use `$bindable()` as a substitute for unidirectional data flow — prefer callback props for most cases.

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

	let {
		items,
		row
	}: {
		items: Contact[];
		row: Snippet<[Contact]>;
	} = $props();
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

---

## Template Helpers

### `{@const}` — Avoid Redundant Computation in Loops

Inside `{#each}` blocks, use `{@const}` to compute values once per iteration.

```svelte
{#each contacts as contact (contact.id)}
	{@const fullName = `${contact.first_name} ${contact.last_name}`}
	{@const isOverdue = contact.follow_up_date && new Date(contact.follow_up_date) < new Date()}
	<div class="contact-row">
		<span>{fullName}</span>
		{#if isOverdue}
			<Badge variant="destructive">Overdue</Badge>
		{/if}
	</div>
{/each}
```

Never call helper functions with the same arguments multiple times in one template iteration — compute once with `{@const}`.
