---
name: contractor-crm-svelte-ui
description: >
  Svelte 5, SvelteKit CSR, Bits UI, and SCSS patterns for the Contractor Growth OS.
  Load this skill whenever you are writing or editing any .svelte file, +page.ts,
  +layout.svelte, component, navigation, SCSS module, or anything related to the
  frontend UI of this project. Also load when implementing the client-side auth
  guard in layouts, setting up Supabase Realtime subscriptions in the UI, building
  permission-gated navigation, using shared components (SkeletonLoader, EmptyState,
  PageWrapper, Badge, BottomSheet, ConfirmDialog), handling forms, showing toasts,
  doing optimistic updates, or styling Bits UI primitives with SCSS data-attribute
  selectors. If you are about to write any Svelte component or page — load this
  skill first, every time. Do not guess Svelte 5 syntax from memory.
---

# Svelte UI Patterns — Contractor Growth OS

> Stack: Svelte 5 Runes ONLY · SvelteKit CSR (`ssr = false`) · Bits UI · SCSS modules
> Types: All shared types live in `$lib/types/index.ts` (Contact, OrgMember, Org, Message, Job, Quote, Invoice, etc.)
> For API route patterns → `contractor-crm-api-patterns`
> For auth/session details → `contractor-crm-auth-rls`

---

## Reference Files — Read Before Writing

Each task requires reading one or more reference files from `references/` in this skill
directory. Read the relevant file(s) BEFORE writing any code. Multiple may apply.

| Task | Read first |
|---|---|
| Any component with props, state, derived, effects, snippets | `references/runes-and-reactivity.md` |
| Forms, mutations, dirty tracking, optimistic updates, Supabase Realtime | `references/data-patterns.md` |
| Dialog, Sheet, Tabs, Select, Switch, SCSS styling, CSS variables | `references/bits-ui-and-scss.md` |
| Auth guard, permissions, nav, error pages | `references/navigation-and-auth.md` |
| Toast, shared components, loading/error/pagination states | `references/shared-components.md` |

When in doubt, read `references/runes-and-reactivity.md` — it applies to every component.

---

## SvelteKit CSR Rules (always apply)

```typescript
// src/routes/(app)/contacts/+page.ts — client-side data loading
export const ssr = false; // set globally in root +layout.ts — never override to true

export const load = async ({ fetch, url }) => {
  const cursor = url.searchParams.get('cursor');
  const res = await fetch(`/api/contacts${cursor ? `?cursor=${cursor}` : ''}`);
  if (!res.ok) throw new Error('Failed to load contacts');
  const data = await res.json();
  return { contacts: data.items, nextCursor: data.next_cursor };
};
```

- ❌ NEVER use `+page.server.ts` for UI data loading
- ❌ NEVER import `$lib/server/*` in `.svelte` files
- ❌ NEVER override `ssr = false` on any route
- All API calls go to `/api/*` routes via `fetch()`. Clients never touch the DB directly.

### Refreshing Data After Mutations

```ts
import { invalidate, invalidateAll } from '$app/navigation';

await invalidate('/api/contacts');   // re-runs matching load()
await invalidateAll();               // nuclear — re-runs ALL load() functions
```

Never reconstruct state manually or do a full `goto()` reload after mutations.

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
```

---

## Key Rules (Non-Negotiable — always enforced)

- **Svelte 5 Runes only** — no `export let`, no `$:`, no `on:` directives, no `writable`/`readable` stores
- **Shared reactive state uses `.svelte.ts` files** — never `svelte/store` imports
- **`ssr = false` globally** — never use `+page.server.ts` for UI data
- **`$lib/server/*` never imported** in `.svelte` files
- **No Tailwind** — SCSS modules only
- **No inline styles** — exception: dynamic CSS custom property values (`style="--progress: {pct}%"`)
- **Bits UI states are data attributes** — never invent class-based state selectors
- **Touch targets ≥ 44px** minimum height on all interactive elements
- **Every destructive action uses `ConfirmDialog`** — never a bare `onclick` delete
- **Always `padding-bottom: var(--bottom-nav-height)`** on main content areas
- **Toast via `$lib/stores/toast.svelte`** — never `alert()`, never a custom one-off
- **Context via typed helpers** — never raw `getContext`/`setContext` with string keys
- **Permissions via `can()` / `canAny()`** — never raw `member.can_*` in templates
- **Auth guard uses `$effect` only** — never combine `onMount` + `$effect` for session checking
- **Realtime cleanup always returned** — memory leaks are silent and cumulative
- **`{#each}` always keyed by `item.id`** — never by array index
- **`$inspect()` for debug only** — never committed to main
- **`$derived.by()` for multi-step derivations** — never `$effect` + `$state` as a workaround
- **`beforeNavigate` guard required** when `isDirty` tracking exists — tracking without a guard is a bug
- **`invalidate()` after mutations** — never reconstruct state manually or do full `goto()` reloads
- **`untrack()` in effects** when reading non-dependency state — prevents unnecessary re-runs
- **`onMount` for one-time setup, `$effect` for reactive re-runs** — never mix both for the same concern
- **Always cast `payload.new`** in Realtime callbacks — never use untyped `any` from Supabase
