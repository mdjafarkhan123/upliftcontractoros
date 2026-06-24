---
name: contractor-crm-svelte-ui
description: >
  Svelte 5, SvelteKit CSR, shadcn-svelte, and Tailwind CSS patterns for the Contractor Growth OS.
  Load this skill whenever you are writing or editing any .svelte file, +page.ts,
  +layout.svelte, component, navigation, or anything related to the frontend UI of
  this project. Also load when implementing the client-side auth guard in layouts,
  setting up Supabase Realtime subscriptions in the UI, building permission-gated
  navigation, using shared components (SkeletonLoader, EmptyState, PageWrapper,
  Badge, BottomSheet, ConfirmDialog), handling forms, showing toasts, doing optimistic
  updates, or composing shadcn-svelte primitives with Tailwind utility classes and
  the cn() helper. If you are about to write any Svelte component or page — load
  this skill first, every time. Do not guess Svelte 5 syntax from memory.
---

# Svelte UI Patterns — Contractor Growth OS

> Stack: Svelte 5 Runes ONLY · SvelteKit CSR (`ssr = false`) · shadcn-svelte · Tailwind CSS
> Types: All shared types live in `$lib/types/index.ts` (Contact, OrgMember, Org, Message, Job, Quote, Invoice, etc.)
> For API route patterns → `contractor-crm-api-patterns`
> For auth/session details → `contractor-crm-auth-rls`

---

## Reference Files — Read Before Writing

Each task requires reading one or more reference files from `references/` in this skill
directory. Read the relevant file(s) BEFORE writing any code. Multiple may apply.

| Task                                                                       | Read first                           |
| -------------------------------------------------------------------------- | ------------------------------------ |
| Any component with props, state, derived, effects, snippets                | `references/runes-and-reactivity.md` |
| Forms, mutations, dirty tracking, optimistic updates, Supabase Realtime    | `references/data-patterns.md`        |
| Dialog, Sheet, Tabs, Select, Switch, Button, Badge, cn() utility, Tailwind | `references/shadcn-svelte.md`        |
| Auth guard, permissions, nav, error pages                                  | `references/navigation-and-auth.md`  |
| Toast, shared components, loading/error/pagination states                  | `references/shared-components.md`    |
| List stores, caching, SWR, pagination                                      | `references/list-stores.md`          |

When in doubt, read `references/runes-and-reactivity.md` — it applies to every component.

---

## SvelteKit CSR Rules (always apply)

### +page.ts — URL params ONLY. Never fetch data here.

```typescript
// ✅ CORRECT — +page.ts only extracts URL state. Returns instantly.

export const load = ({ url }) => {
	return {
		cursor: url.searchParams.get('cursor') ?? null,
		filter: url.searchParams.get('filter') ?? null
	};
};
```

```typescript
// ❌ WRONG — awaiting API calls in load() freezes navigation
export const load = async ({ fetch }) => {
	const res = await fetch('/api/contacts'); // blocks the entire navigation
	return { contacts: await res.json() };
};
```

### +page.svelte — Renders instantly with skeleton loader. Make all import, Fetches data after mount.

Page shell and skeleton render **before** any data arrives.
Navigation completes immediately. Data fills in behind it.

### Refreshing data after mutations

Call your fetch logic again directly — no `invalidate` needed since
load() holds no data.

```typescript
async function refresh() {
	loading = true;
	// re-run the same onMount fetch logic
}
```

- ❌ NEVER use `+page.server.ts` for UI data loading
- ❌ NEVER import `$lib/server/*` in `.svelte` files
- ❌ NEVER override `ssr = false` on any route
- ❌ NEVER `await fetch()` inside a `+page.ts` load function
- All API calls go to `/api/*` routes via `fetch()` inside components only

---

## Typed Context Helpers (always apply)

Never use raw string keys or inline `getContext`/`setContext`. Define typed helpers once.

```typescript
// src/lib/context/member.ts
import { getContext, setContext } from 'svelte';
import type { OrgMember } from '$lib/types';

const MEMBER_KEY = Symbol('member');

export function setMemberContext(member: OrgMember): void {
	setContext(MEMBER_KEY, member);
}

export function getMemberContext(): OrgMember {
	const member = getContext<OrgMember>(MEMBER_KEY);
	if (!member) throw new Error('getMemberContext called outside (app) layout tree');
	return member;
}
```

```typescript
// src/lib/context/org.ts
import { getContext, setContext } from 'svelte';
import type { Org } from '$lib/types';

const ORG_KEY = Symbol('org');

export function setOrgContext(org: Org): void {
	setContext(ORG_KEY, org);
}

export function getOrgContext(): Org {
	const org = getContext<Org>(ORG_KEY);
	if (!org) throw new Error('getOrgContext called outside (app) layout tree');
	return org;
}
```

---

## ❌ Forbidden — Svelte 4 Patterns (always visible)

These will not compile or will silently break. Never use them anywhere.

```svelte
export let value;                               // ❌ use $props()
$: doubled = value * 2;                         // ❌ use $derived() or $derived.by()
import { createEventDispatcher } from 'svelte'; // ❌ use callback props
import { writable } from 'svelte/store';        // ❌ use $state in .svelte.ts files
<button on:click={handler}>                     // ❌ use onclick={}
<input on:input={handler} />                    // ❌ use oninput={}
<slot />                                        // ❌ use {#snippet} + {@render}
<slot name="header" />                          // ❌ use named snippet props
<Component bind:value={x} />   // ❌ only works if `value` is declared $bindable()
                                //    inside the child's $props(). See runes-and-reactivity.md.
```

---

## Key Rules (Non-Negotiable — always enforced)

- **Svelte 5 Runes only** — no `export let`, no `$:`, no `on:` directives, no `writable`/`readable` stores
- **Two-way bindable props use `$bindable()`** — `let { open = $bindable(false) } = $props()`. Never expect `bind:x` to work on a prop not declared `$bindable()`.
- **Rest props via destructuring** — `let { class: className, ...rest } = $props()` when wrapping native elements or shadcn components. Never duplicate every HTML attribute explicitly.
- **Shared reactive state uses `.svelte.ts` files** — never `svelte/store` imports
- **`ssr = false` globally** — never use `+page.server.ts` for UI data
- **`page` from `$app/state`** — import `{ page }` from `'$app/state'` for rune-based reactive page data. Never import from `'$app/stores'` — that is the Svelte 4 store pattern.
- **`$lib/server/*` never imported** in `.svelte` files
- **Tailwind utility classes only** — no SCSS modules, no raw CSS files per component
- **`cn()` from `$lib/utils` for all conditional/merged classes** — never string concatenation
- **No inline styles** — exception: dynamic CSS custom property values (`style="--progress: {pct}%"`)
- **shadcn-svelte components from `$lib/components/ui/*`** — never import from `bits-ui` directly
- **Touch targets ≥ 44px** — use `min-h-[44px]` on all interactive elements
- **Every destructive action uses `ConfirmDialog`** — never a bare `onclick` delete
- **Always `pb-[var(--bottom-nav-height)]`** on main content areas (bottom nav covers content)
- **Toast via `$lib/stores/toast.svelte`** — never `alert()`, never a custom one-off
- **Context via typed helpers** — never raw `getContext`/`setContext` with string keys
- **Permissions via `can()` / `canAny()`** — never raw `member.can_*` in templates
- **Auth guard uses `$effect` only** — never combine `onMount` + `$effect` for session checking
- **Realtime cleanup always returned** — memory leaks are silent and cumulative
- **`{#each}` always keyed by `item.id`** — never by array index
- **`$inspect()` for debug only** — never committed to main
- **`$derived.by()` for multi-step derivations** — never `$effect` + `$state` as a workaround
- **`beforeNavigate` guard required** when `isDirty` tracking exists — tracking without a guard is a bug
- **`untrack()` in effects** when reading non-dependency state — prevents unnecessary re-runs
- **`onMount` for one-time setup, `$effect` for reactive re-runs** — never mix both for the same concern
- **Always cast `payload.new`** in Realtime callbacks — never use untyped `any` from Supabase
- **Cache layer = module-level $state in .svelte.ts** — exported as a plain object
  with getters. Never svelte/store. Never writable(). This is the Svelte 5 singleton
  store pattern.

- **Stale-while-revalidate on every mount** — if cached data exists, render it
  immediately. If last fetch was > 30s ago, revalidate silently in background.
  User never sees a skeleton on revisit.

- **load(force?) skips fetch when fresh** — checks lastFetchedAt before hitting
  the network. force = true bypasses the staleness check entirely.
- **`+page.ts` returns URL params only** — no `await`, no `fetch()`, no API calls in
  load functions. Navigation must complete in < 1ms at the routing layer.
- **Skeletons on first-load only** — show SkeletonLoader only when no cached data exists.
  Background refreshes must preserve visible UI. Never clear existing data to show a spinner.
- **Session loads once, never refetched** — org, member, permissions fetched once and held
  in Svelte 5 context via typed helpers. Never call `/api/session` again on navigation.
- **Every cache store exposes exactly four methods** — `load(force?: boolean)`, `update(item)`,
  `remove(id)`, `invalidate()`. After any mutation, call `update()` or `remove()` in-place.
  Never wipe the list and refetch the whole collection after a single mutation.
- **Beautiful design, always** — every UI must be polished and mobile-first. Always use
  shadcn-svelte components from `$lib/components/ui/*`. If a needed component does not
  exist there, create it in `$lib/components/ui/` first, then use it. Never write
  one-off UI primitives inline on a page.
