# Navigation, Auth & Permissions

> Read this before touching the app layout, auth guard, navigation, permissions, or error pages.

---

## Client-Side Auth Guard — `/(app)/+layout.svelte`

`hooks.server.ts` fires on initial load and API calls only — it does NOT fire on
client-side SvelteKit navigation. This layout guard covers navigation.

**Critical:** Use `$effect` only for session checking. Do NOT combine `onMount` + `$effect`
— they both fire on initial mount, causing a double-redirect and potential flickering.

```svelte
<!-- src/routes/(app)/+layout.svelte -->
<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { setMemberContext, setOrgContext } from '$lib/context/member';
  import Toaster from '$lib/components/shared/Toaster.svelte';

  let { data, children } = $props();

  setMemberContext(data.member);
  setOrgContext(data.org);

  // $effect runs on mount AND on every client-side navigation.
  // Reactive dependencies: page.url.pathname, data.session, data.org
  // NOTE: page is from $app/state — use page.x directly, NOT $page.x
  $effect(() => {
    const path = page.url.pathname;

    if (!data.session) {
      goto('/auth/login');
      return;
    }

    if (data.org && !data.org.is_setup_complete) {
      if (!path.startsWith('/setup')) goto('/setup');
      return;
    }

    if (data.org?.status === 'suspended') {
      goto('/auth/suspended');
    }
  });
</script>

{@render children()}
<Toaster />
```

> **Edge case — mid-session token expiry:** The `$effect` guard only fires when its
> reactive dependencies change. A silently expired token mid-session won't trigger it.
> Every `/api/*` fetch wrapper must check for a `401` response and call `goto('/auth/login')`
> immediately. Define a shared `apiFetch()` utility that handles this centrally rather
> than checking `401` in every component.

---

## Permission Helper

Never scatter raw `member.can_*` checks across templates. One helper, fully typed.

```typescript
// src/lib/permissions.ts
import type { OrgMember } from '$lib/types';

type PermissionKey = keyof Pick<
  OrgMember,
  | 'can_view_dashboard'
  | 'can_view_all_conversations'
  | 'can_view_assigned_conversations'
  | 'can_view_all_contacts'
  | 'can_manage_contacts'
  | 'can_view_full_pipeline'
  | 'can_view_assigned_jobs'
  | 'can_view_all_quotes'
  | 'can_manage_quotes'
  | 'can_view_all_invoices'
  | 'can_manage_invoices'
  | 'can_view_all_appointments'
  | 'can_view_assigned_appointments'
  | 'can_view_reviews'
  | 'can_view_growth_feed'
  | 'can_view_team_members'
  | 'can_manage_team_members'
  | 'can_manage_org_settings'
>;

export function can(member: OrgMember, permission: PermissionKey): boolean {
  return member[permission] === true;
}

export function canAny(member: OrgMember, permissions: PermissionKey[]): boolean {
  return permissions.some(p => member[p] === true);
}

export function canAll(member: OrgMember, permissions: PermissionKey[]): boolean {
  return permissions.every(p => member[p] === true);
}
```

Usage:

```svelte
<script lang="ts">
  import { getMemberContext } from '$lib/context/member';
  import { can, canAny } from '$lib/permissions';
  const member = getMemberContext();
</script>

{#if canAny(member, ['can_view_all_conversations', 'can_view_assigned_conversations'])}
  <a href="/inbox">Inbox</a>
{/if}
```

---

## Permission-Gated Navigation

Navigation items render only if the user has the relevant permission.
Never show locked/disabled states — if no access, the item is absent.

```svelte
<script lang="ts">
  import { getMemberContext } from '$lib/context/member';
  import { can, canAny } from '$lib/permissions';
  import BottomSheet from '$lib/components/shared/BottomSheet.svelte';

  let showMore = $state(false);
  const member = getMemberContext();
</script>

<!-- Bottom nav (mobile) — max 5 primary items -->
<nav class="bottom-nav">
  <a href="/dashboard" class="nav-item">Dashboard</a>

  {#if canAny(member, ['can_view_all_conversations', 'can_view_assigned_conversations'])}
    <a href="/inbox" class="nav-item">Inbox</a>
  {/if}

  {#if can(member, 'can_view_all_contacts')}
    <a href="/contacts" class="nav-item">Contacts</a>
  {/if}

  {#if can(member, 'can_view_full_pipeline')}
    <a href="/pipeline" class="nav-item">Pipeline</a>
  {/if}

  {#if canAny(member, ['can_view_full_pipeline', 'can_view_assigned_jobs'])}
    <a href="/jobs" class="nav-item">Jobs</a>
  {/if}

  <button class="nav-item" onclick={() => (showMore = true)}>More</button>
</nav>

<!-- Secondary items in BottomSheet (mobile) / sidebar (desktop) -->
<!-- BottomSheet must declare `open` as $bindable() in its $props() — see runes-and-reactivity.md -->
<BottomSheet bind:open={showMore}>
  {#if can(member, 'can_view_all_quotes')}
    <a href="/quotes">Quotes</a>
  {/if}
  {#if can(member, 'can_view_all_invoices')}
    <a href="/invoices">Invoices</a>
  {/if}
  {#if canAny(member, ['can_view_all_appointments', 'can_view_assigned_appointments'])}
    <a href="/appointments">Appointments</a>
  {/if}
  {#if can(member, 'can_view_reviews')}
    <a href="/reputation">Reputation</a>
  {/if}
  {#if can(member, 'can_view_growth_feed')}
    <a href="/growth">Growth</a>
  {/if}
  {#if can(member, 'can_view_team_members')}
    <a href="/settings/team">Team</a>
  {/if}
</BottomSheet>
```

---

## Error Pages

When a `load()` function throws, SvelteKit renders the nearest `+error.svelte`.
Provide one inside the `(app)` group so errors inherit the app layout.

```svelte
<!-- src/routes/(app)/+error.svelte -->
<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import EmptyState from '$lib/components/shared/EmptyState.svelte';
  import PageWrapper from '$lib/components/shared/PageWrapper.svelte';
</script>

<PageWrapper title="Error">
  <EmptyState
    title={page.status === 404 ? 'Page not found' : 'Something went wrong'}
    description={page.error?.message ?? 'An unexpected error occurred.'}
    actionLabel="Go to Dashboard"
    onAction={() => goto('/dashboard')}
  />
</PageWrapper>
```

Root-level fallback for errors outside the `(app)` group:

```svelte
<!-- src/routes/+error.svelte -->
<script lang="ts">
  import { page } from '$app/state';
</script>

<div class="error-page">
  <h1>{page.status}</h1>
  <p>{page.error?.message ?? 'Something went wrong.'}</p>
  <a href="/">Back to home</a>
</div>
```
