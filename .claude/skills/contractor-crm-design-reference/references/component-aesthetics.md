# Component Aesthetics — Contractor Growth OS

> Read this for how specific components should look and feel, and for the API of shared components.  
> All shadcn primitives come from `$lib/components/ui/*`.  
> All shared design components live in `$lib/components/shared/*`.  
> All class composition uses `cn()` from `$lib/utils/cn`.

---

## Surface Hierarchy

Four layers. Every element must sit on exactly one of these:

```
LIGHT MODE:
  Layer 0 — Sidebar (bg-sidebar = gray-50)                ← navigation rail
  Layer 1 — Page / Content (bg-background = white)        ← main content area
  Layer 2 — Card (bg-card = white + border + shadow-card) ← floats on the page
  Layer 3 — Popover / Modal (bg-popover + shadow-modal)   ← highest elevation

DARK MODE:
  Layer 0 — Page (bg-background = deep navy #080C14)      ← deepest
  Layer 1 — Sidebar (bg-sidebar = slightly lighter navy)  ← nav rail
  Layer 2 — Card (bg-card = navy + border + shadow-card)  ← surfaces
  Layer 3 — Popover / Modal                               ← highest elevation

  Dark mode depth is created by the inset top-highlight shadow technique,
  not by lightening the card background significantly.
```

**Rule:** Never put a card inside another card of the same `bg-card`. If nesting is needed, use `bg-muted` or `bg-card-raised` for the inner surface.  
**Rule:** The sidebar is ALWAYS `bg-sidebar`, never `bg-background` or `bg-card`.

---

## Card Patterns

### Standard Card (most common)

```svelte
<div class="rounded-xl border border-border/60 bg-card p-4 shadow-card">
  <!-- content -->
</div>
```

### Card with hover lift (interactive, clickable cards)

```svelte
<a href="/..." class="group block rounded-xl border border-border/60 bg-card p-4 shadow-card
  transition-all duration-150 ease-out
  hover:border-primary/30 hover:bg-card-raised hover:shadow-dropdown
  active:bg-muted/70
  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring
  dark:border-white/10">
  <!-- content -->
</a>
```

### Nested surface inside a card

```svelte
<div class="rounded-xl border border-border/60 bg-card p-4 shadow-card">
  <p class="text-sm font-semibold text-foreground">Section title</p>
  <!-- Nested: use bg-muted NOT bg-card -->
  <div class="mt-3 rounded-lg bg-muted p-3">
    inner content
  </div>
</div>
```

### Card with section dividers

```svelte
<div class="rounded-xl border border-border/60 bg-card shadow-card overflow-hidden">
  <div class="px-4 py-3 border-b border-border/40">
    <p class="text-sm font-semibold text-foreground">Title</p>
  </div>
  <div class="px-4 py-3">
    body content
  </div>
  <div class="px-4 py-3 border-t border-border/40 bg-muted/30">
    footer / actions
  </div>
</div>
```

---

## Status / Alert Banner Patterns

Used for inline status banners (deposit received, change requests, expired notices, etc.). Each uses a colored border + tinted background + icon.

### Success / Received (emerald)

```svelte
<div class="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
  <div class="flex items-start gap-3">
    <div class="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-700 dark:text-emerald-300">
      <Check class="h-4 w-4" />
    </div>
    <div class="min-w-0 flex-1">
      <p class="text-sm font-semibold text-emerald-800 dark:text-emerald-200">Deposit received</p>
      <p class="mt-1 text-sm text-emerald-900/90 dark:text-emerald-100/90">Details here</p>
    </div>
  </div>
</div>
```

### Warning / Action Needed (amber)

```svelte
<div class="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
  <div class="flex items-start gap-3">
    <div class="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-300">
      <AlertTriangle class="h-4 w-4" />
    </div>
    <div class="min-w-0 flex-1">
      <p class="text-sm font-semibold text-amber-800 dark:text-amber-200">Action needed</p>
      <p class="mt-1 text-sm text-amber-900/90 dark:text-amber-100/90">Details here</p>
    </div>
  </div>
</div>
```

### Neutral / Expired / Info (zinc/slate)

```svelte
<div class="rounded-xl border border-zinc-500/30 bg-zinc-500/10 p-4">
  <div class="flex items-start gap-3">
    <div class="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-500/20 text-zinc-700 dark:text-zinc-300">
      <Clock class="h-4 w-4" />
    </div>
    <div class="min-w-0 flex-1">
      <p class="text-sm font-semibold text-zinc-800 dark:text-zinc-200">Heading</p>
      <p class="mt-1 text-sm text-zinc-700/90 dark:text-zinc-300/90">Details here</p>
    </div>
  </div>
</div>
```

---

## Shared Component APIs

### `PageWrapper` — wraps every page

```svelte
import PageWrapper from '$lib/components/shared/PageWrapper.svelte';

<!-- Basic -->
<PageWrapper title="Quotes" subtitle="Drafts, sent, viewed, accepted">
  <!-- page content -->
</PageWrapper>

<!-- With back button and action buttons -->
<PageWrapper title="Quote #Q-0042" back="/quotes">
  {#snippet actions()}
    <Button>Save</Button>
    <Button variant="outline">Send</Button>
  {/snippet}
  <!-- page content -->
</PageWrapper>
```

Props:
- `title` — page heading (h1), shown in sticky header
- `subtitle` — secondary line below title
- `back` — `true` for `history.back()`, or a route string like `"/quotes"`
- `actions` — snippet rendered in header right side
- `class` — extra classes on the outer wrapper div
- Outer wrapper: `mx-auto w-full max-w-screen-xl px-4 py-4 md:px-6 md:py-6`
- Header: sticky at `md:top-0` with `z-30`, hosts title + actions + global controls (search, theme, user)

### `Badge` — semantic status chip

```svelte
import Badge from '$lib/components/shared/Badge.svelte';

<Badge label="Active" variant="success" />
<Badge label="Draft" variant="default" />
<Badge label="Overdue" variant="danger" />
<Badge label="Pending" variant="warning" />
<Badge label="Sent" variant="info" />
```

Variants: `default` | `success` | `warning` | `danger` | `info`

### `EmptyState` — empty list placeholder

```svelte
import EmptyState from '$lib/components/shared/EmptyState.svelte';
import { FileText } from '@lucide/svelte';

<EmptyState
  icon={FileText}
  title="No quotes yet"
  description="Quotes you create will appear here."
  actionLabel="New quote"
  onAction={() => goto('/quotes/new')}
/>
```

Props: `title` (required), `description`, `icon` (Lucide component), `actionLabel`, `onAction`  
Renders a dashed-border centered container — never use blank whitespace for empty lists.

### `ConfirmDialog` — replaces native confirm()

```svelte
import ConfirmDialog from '$lib/components/shared/ConfirmDialog.svelte';

let confirmOpen = $state(false);
let deleting = $state(false);

<ConfirmDialog
  bind:open={confirmOpen}
  title="Delete this quote?"
  description="This cannot be undone."
  confirmLabel="Delete"
  variant="destructive"
  loading={deleting}
  onConfirm={async () => { deleting = true; await deleteQuote(); deleting = false; }}
/>
```

Props: `open` ($bindable), `title`, `description`, `confirmLabel`, `cancelLabel`, `variant` (`default` | `destructive`), `loading`, `onConfirm`, `onCancel`

### `BottomSheet` — mobile action sheet

```svelte
import BottomSheet from '$lib/components/shared/BottomSheet.svelte';

let sheetOpen = $state(false);

<BottomSheet bind:open={sheetOpen} title="Choose action">
  <div class="p-4 space-y-2">
    <!-- sheet content -->
  </div>
</BottomSheet>
```

Uses shadcn `Sheet` with `side="bottom"`.

### `SkeletonLoader` — loading placeholder

```svelte
import SkeletonLoader from '$lib/components/shared/SkeletonLoader.svelte';

<!-- Basic: 3 lines at default height -->
<SkeletonLoader lines={3} />

<!-- For taller rows (list items, cards) -->
<SkeletonLoader lines={5} height="84px" label="Loading quotes" />
```

Props: `lines` (count of shimmer bars), `height` (string, e.g. `"1rem"`, `"84px"`), `gap` (string spacing between bars), `label` (aria-label)  
Uses `.skeleton-shimmer` CSS class from `app.css` — automatically adapts to light/dark mode.

### `JetEngineButton` — primary async action button

```svelte
import JetEngineButton from '$lib/components/shared/JetEngineButton.svelte';

<!-- External state control (form save) -->
<JetEngineButton
  label="Save quote"
  loadingLabel="Saving…"
  successLabel="Saved"
  state={saving ? 'loading' : 'idle'}
  onclick={save}
>
  {#snippet icon()}<Save class="h-4 w-4" />{/snippet}
</JetEngineButton>

<!-- Self-managed async action -->
<JetEngineButton
  label="Send invoice"
  loadingLabel="Sending…"
  successLabel="Sent!"
  onAction={async () => { await sendInvoice(); }}
/>
```

Props: `label`, `loadingLabel`, `successLabel`, `state` (`idle` | `loading` | `success`), `onAction` (async), `onclick`, `variant`, `size`, `disabled`, `icon` (snippet)  
Shows: Loader2 with jet engine spool-up animation → green Check with pop-in animation on success.  
Use for: all primary destructive or save operations. Use plain `Button` for secondary/outline actions.

---

## List Item / Row Patterns

### Clickable list card (standard — contacts, quotes, jobs)

```svelte
<a
  href="/quotes/{id}"
  class="group flex items-center gap-3 rounded-xl border border-border/60 bg-card px-4 py-3
    shadow-card transition-all duration-150 ease-out
    hover:border-primary/30 hover:bg-card-raised hover:shadow-dropdown
    active:bg-muted/70
    focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring
    dark:border-white/10"
>
  <!-- Avatar / Icon -->
  <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
    <FileText class="h-5 w-5" />
  </div>

  <!-- Main content -->
  <div class="min-w-0 flex-1">
    <div class="flex items-center gap-2">
      <span class="text-sm font-semibold text-foreground">Q-0042</span>
      <Badge label="Sent" variant="info" />
    </div>
    <p class="mt-0.5 truncate text-sm text-muted-foreground">John Smith · Roof replacement</p>
    <p class="mt-0.5 text-xs text-muted-foreground">Sent Jun 15</p>
  </div>

  <!-- Right value -->
  <div class="shrink-0 text-right">
    <p class="font-mono text-sm font-semibold tabular-nums text-foreground">$4,800.00</p>
  </div>

  <!-- Chevron -->
  <ChevronRight class="h-4 w-4 shrink-0 text-muted-foreground/60
    transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-muted-foreground" />
</a>
```

### Key–value detail row (inside detail cards)

```svelte
<dl class="space-y-3">
  <div class="flex items-center justify-between gap-4">
    <dt class="text-sm text-muted-foreground">Contact</dt>
    <dd class="text-sm font-medium text-foreground">John Smith</dd>
  </div>
  <div class="flex items-center justify-between gap-4 border-t border-border/40 pt-3">
    <dt class="text-sm text-muted-foreground">Total</dt>
    <dd class="font-mono text-sm font-semibold tabular-nums text-foreground">$4,800.00</dd>
  </div>
</dl>
```

---

## Avatar / Initials Pattern

Avatars use **status-coded ring colors** — never a single color for all records.

```svelte
{@const initials = contact.full_name.split(/\s+/).map(p => p[0]?.toUpperCase() ?? '').slice(0, 2).join('')}

<div class={cn(
  'flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold ring-1',
  contact.status === 'customer'
    ? 'bg-emerald-500/10 text-emerald-700 ring-emerald-500/20 dark:text-emerald-400'
    : contact.status === 'archived' || contact.status === 'inactive'
      ? 'bg-slate-100 text-slate-500 ring-slate-200 dark:bg-slate-500/10 dark:text-slate-400 dark:ring-slate-500/20'
      : 'bg-primary/10 text-primary ring-primary/15'   // lead / new — brand green
)}>
  {initials || '?'}
</div>
```

Sizes:
- `h-9 w-9` — table rows, detail page headers
- `h-10 w-10` — list item cards
- `h-11 w-11` — mobile list cards (larger touch target area)

---

## Section Header Pattern (within a page, above a list or group)

```svelte
<div class="flex items-center justify-between">
  <h2 class="text-sm font-semibold text-foreground">Line items</h2>
  <Button variant="outline" size="sm" onclick={...}>
    <Plus class="mr-1 h-4 w-4" />Add item
  </Button>
</div>
```

For larger page sections:
```svelte
<div class="mb-4 flex items-center justify-between">
  <div>
    <h2 class="text-base font-semibold text-foreground">Payment history</h2>
    <p class="mt-0.5 text-sm text-muted-foreground">All recorded transactions</p>
  </div>
  <Button size="sm">Record payment</Button>
</div>
```

---

## Data Table Pattern

Use `.data-table` and `.table-container` CSS classes from `app.css`:

```svelte
<div class="table-container">
  <table class="data-table">
    <thead>
      <tr>
        <th>Name</th>
        <th>Status</th>
        <th class="text-right">Amount</th>
      </tr>
    </thead>
    <tbody>
      {#each items as item (item.id)}
        <tr class="group">
          <td>{item.name}</td>
          <td><Badge label={item.status} variant="success" /></td>
          <td class="text-right font-mono tabular-nums">{formatCurrency(item.amount)}</td>
        </tr>
      {/each}
    </tbody>
  </table>
</div>
```

Header cells get: `text-xs font-medium uppercase tracking-wider text-muted-foreground` automatically via `.data-table thead th`.

---

## Icon + Label Row (settings / info rows)

```svelte
<!-- Used in settings lists, info panels, stat rows -->
<div class="flex items-center gap-3 rounded-lg p-3 transition-colors hover:bg-muted/60">
  <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
    <Mail class="h-4 w-4" />
  </div>
  <div class="min-w-0 flex-1">
    <p class="text-sm font-medium text-foreground">Email notifications</p>
    <p class="text-xs text-muted-foreground">Receive updates via email</p>
  </div>
  <Switch bind:checked={enabled} />
</div>
```

---

## KPI / Stat Card Pattern

```svelte
<div class="rounded-xl border border-border/60 bg-card p-4 shadow-card">
  <div class="flex items-start justify-between gap-2">
    <div class="min-w-0">
      <p class="text-xs font-medium uppercase tracking-wider text-muted-foreground">Revenue</p>
      <p class="mt-1 text-2xl font-bold tracking-tight text-foreground tabular-nums">
        {formatCurrency(revenue)}
      </p>
      <p class="mt-1 flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
        <TrendingUp class="h-3 w-3" />+12% vs last month
      </p>
    </div>
    <!-- Icon badge — top right -->
    <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
      <DollarSign class="h-5 w-5" />
    </div>
  </div>
</div>
```

---

## Form Field Pattern

```svelte
<div class="grid gap-2">
  <Label for="title">Title <span class="text-destructive">*</span></Label>
  <Input id="title" bind:value={title} placeholder="e.g. Roof replacement" />
  {#if fieldErrors.title}
    <p class="text-xs text-destructive">{fieldErrors.title}</p>
  {/if}
</div>
```

Rules:
- Mandatory fields always have `<span class="text-destructive">*</span>` in the label
- Error text is `text-xs text-destructive` below the input
- Labels are `text-sm font-medium` via shadcn Label component
- Group fields with `<div class="grid gap-2">` for label → input → error layout
- Group related fields in a card: `<div class="grid gap-4 rounded-xl border border-border/60 bg-card p-4 shadow-card">`
