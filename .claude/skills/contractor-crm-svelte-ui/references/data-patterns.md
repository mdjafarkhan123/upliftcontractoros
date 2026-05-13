# Data Patterns — Forms, Mutations, Realtime

> Read this before building any form, mutation handler, or Realtime subscription.

---

## Form Handling Pattern

Every form follows this pattern. No exceptions, no invented variations.

API error shape contract (must match CLAUDE.md Rule 20):
- `error: string` — shown in toast
- `field_errors?: Record<string, string>` — mapped to inline field errors, keys match form field names

```svelte
<script lang="ts">
  import { beforeNavigate } from '$app/navigation';
  import { toast } from '$lib/stores/toast.svelte';

  // ── Form state ─────────────────────────────────────────────
  let form = $state({
    full_name: '',
    email: '',
    phone: '',
    status: 'lead' as 'lead' | 'active' | 'inactive',
  });

  // ── Validation errors ──────────────────────────────────────
  let errors = $state<Partial<Record<keyof typeof form, string>>>({});

  // ── Submission state ───────────────────────────────────────
  let submitting = $state(false);

  // ── Dirty tracking ─────────────────────────────────────────
  // initialForm is a plain checkpoint, NOT reactive state.
  // Only $state.snapshot(form) is reactive inside isDirty — that's the trigger.
  let initialForm = structuredClone($state.snapshot(form));

  let isDirty = $derived(
    JSON.stringify($state.snapshot(form)) !== JSON.stringify(initialForm)
  );

  // ── Navigation guard — warn before leaving dirty form ──────
  beforeNavigate(({ cancel }) => {
    if (isDirty && !submitting) {
      if (!confirm('You have unsaved changes. Leave anyway?')) {
        cancel();
      }
    }
  });

  // ── Validation ─────────────────────────────────────────────
  function validate(): boolean {
    const next: typeof errors = {};

    if (!form.full_name.trim()) {
      next.full_name = 'Name is required';
    }
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      next.email = 'Enter a valid email address';
    }
    if (form.phone && !/^\+?[\d\s\-().]{7,}$/.test(form.phone)) {
      next.phone = 'Enter a valid phone number';
    }

    errors = next;
    return Object.keys(next).length === 0;
  }

  // ── Submit ─────────────────────────────────────────────────
  async function handleSubmit() {
    if (!validate()) return;
    if (submitting) return;

    submitting = true;
    try {
      const res = await fetch('/api/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify($state.snapshot(form)),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        if (body.field_errors) {
          errors = body.field_errors;
          return;
        }
        throw new Error(body.error ?? 'Save failed');
      }

      const saved = await res.json();
      initialForm = structuredClone($state.snapshot(form)); // clear dirty flag
      toast.success('Contact saved');

      // Update the cache store in-place — never wipe and refetch
      // Replace with your domain store, e.g.:
      // contactStore.update(saved);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      submitting = false;
    }
  }
</script>

<form onsubmit={(e) => { e.preventDefault(); handleSubmit(); }}>
  <div class="field">
    <label for="full_name">Name *</label>
    <input
      id="full_name"
      type="text"
      bind:value={form.full_name}
      aria-invalid={!!errors.full_name}
      aria-describedby={errors.full_name ? 'full_name-error' : undefined}
    />
    {#if errors.full_name}
      <span id="full_name-error" class="field-error">{errors.full_name}</span>
    {/if}
  </div>

  <button type="submit" class="btn-primary" disabled={submitting || !isDirty}>
    {submitting ? 'Saving...' : 'Save'}
  </button>
</form>
```

**Rules:**
- `submitting` flag must be set before `await` and cleared in `finally` — never skip `finally`
- Never disable submit based on `isDirty` alone for create forms — only for edit forms
- Field errors from the API (`field_errors`) map to the same `errors` object as local validation
- Always call `validate()` first — never let bad data hit the network
- Always include `beforeNavigate` guard when `isDirty` tracking exists — one without the other is a bug

---

## Optimistic Updates

Use for high-frequency actions: status changes, pipeline moves, toggles, quick edits.
Update state immediately, fire request, rollback on failure.

```svelte
<script lang="ts">
  import { toast } from '$lib/stores/toast.svelte';

  let { contact } = $props<{ contact: Contact }>();

  let status = $state(contact.status);
  let updating = $state(false);

  async function changeStatus(newStatus: Contact['status']) {
    if (updating) return;

    const previous = status;       // 1. Capture BEFORE mutating
    status = newStatus;            // 2. Optimistic update
    updating = true;

    try {
      const res = await fetch(`/api/contacts/${contact.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error('Update failed');
    } catch {
      status = previous;           // 3. Rollback on failure
      toast.error('Status update failed. Please try again.');
    } finally {
      updating = false;
    }
  }
</script>
```

**Rules:**
- Always capture `previous` before mutating — never reconstruct it
- `updating` flag prevents double-fires during in-flight requests
- Use optimistic updates for PATCH operations only — not for creates where the server assigns an ID

---

## Supabase Realtime Subscriptions

### Static channel — `onMount`

Channel target never changes while mounted. Use `onMount` — runs once, cleanup on destroy.

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import { createBrowserClient } from '@supabase/ssr';
  import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';
  import type { Message } from '$lib/types';

  let { data } = $props();
  let messages = $state<Message[]>(data.messages);

  onMount(() => {
    const supabase = createBrowserClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY);

    const channel = supabase
      .channel(`messages:${data.conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${data.conversationId}`,
        },
        (payload) => {
          messages = [...messages, payload.new as Message];
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  });
</script>
```

### Dynamic channel — `$effect`

When the subscribed ID can change while the component is mounted (e.g. navigating between
conversations without unmounting), use `$effect` — it re-runs and cleans up automatically.

```svelte
<script lang="ts">
  import { createBrowserClient } from '@supabase/ssr';
  import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';
  import type { Message } from '$lib/types';

  let { data } = $props();
  let messages = $state<Message[]>(data.messages);

  $effect(() => {
    const conversationId = data.conversationId; // capture — dependency
    const supabase = createBrowserClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY);

    messages = data.messages; // reset when switching

    const channel = supabase
      .channel(`messages:${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          messages = [...messages, payload.new as Message];
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  });
</script>
```

### Layout-level notifications (unread count + toast)

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import { createBrowserClient } from '@supabase/ssr';
  import { toast } from '$lib/stores/toast.svelte';
  import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';
  import type { Notification } from '$lib/types';

  let unreadCount = $state(data.unreadNotificationCount ?? 0);

  onMount(() => {
    const supabase = createBrowserClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY);

    const channel = supabase
      .channel(`notifications:${data.member.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `member_id=eq.${data.member.id}`,
        },
        (payload) => {
          const notification = payload.new as Notification;
          unreadCount += 1;
          toast.info(notification.title);
        }
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  });
</script>
```

**Rules:**
- Always return cleanup — memory leaks are silent and cumulative
- Always cast `payload.new` — never use untyped `any` from Supabase
- `onMount` for fixed targets, `$effect` for dynamic targets — never combine both
