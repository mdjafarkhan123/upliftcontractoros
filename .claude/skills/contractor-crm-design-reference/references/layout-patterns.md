# Layout Patterns — Contractor Growth OS

> Read this whenever building or modifying any page layout, grid, or structural composition.  
> The biggest gap in previous UI quality was missing this file — pages defaulted to single-column  
> mobile layouts on desktop screens. Always follow these patterns for professional desktop UI.

---

## App Shell Structure

```
┌─────────────────────────────────────────────────────┐
│  DesktopSidebar (240px fixed, hidden on mobile)     │ ← bg-sidebar
│  ┌───────────────────────────────────────────────┐  │
│  │  Main content area                            │  │ ← bg-background
│  │  md:pl-[var(--sidebar-width)]                 │  │
│  │                                               │  │
│  │  PageWrapper (max-w-screen-xl, centered)      │  │
│  │  ┌─────────────────────────────────────────┐  │  │
│  │  │  Sticky header: title + actions         │  │  │
│  │  │  md:sticky md:top-0 md:z-30             │  │  │
│  │  ├─────────────────────────────────────────┤  │  │
│  │  │  Page content (children)                │  │  │
│  │  └─────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────┘  │
│                                                      │
│  BottomNav (64px, mobile only)                      │
└─────────────────────────────────────────────────────┘
```

**Key CSS variables:**
```
--sidebar-width:     240px    applied as md:pl-[var(--sidebar-width)] on content wrapper
--header-height:     56px     mobile AppHeader (hidden on desktop)
--bottom-nav-height: 64px     mobile BottomNav (hidden on desktop)
--content-max-width: 768px    soft max-width for single-column content (apply manually)
```

**Breakpoints used in this project:**
```
sm:   640px
md:   768px   ← mobile/desktop split for sidebar, bottom nav, header
lg:   1024px  ← two-column layouts switch here
xl:   1280px  ← max-w-screen-xl outer wrapper
```

The `PageWrapper` outer div is already `max-w-screen-xl` centered — all page content sits within this constraint. You do not need to add another outer wrapper.

---

## PageWrapper — Core Page Shell

Every page must use `PageWrapper`. It provides:
- Outer wrapper: `mx-auto w-full max-w-screen-xl px-4 py-4 md:px-6 md:py-6`
- Sticky header at `md:top-0 md:z-30` with title, back button, action buttons, and global controls
- Responsive padding and max-width

```svelte
<PageWrapper title="Quotes" subtitle="Manage your quotes">
  {#snippet actions()}
    <Button onclick={() => goto('/quotes/new')}>
      <Plus class="mr-1 h-4 w-4" />New quote
    </Button>
  {/snippet}

  <!-- YOUR PAGE CONTENT HERE -->
</PageWrapper>
```

The `actions` snippet is rendered in the right side of the sticky header. Keep to 1–3 actions maximum.

---

## List Page Layout (single-column — contacts, jobs, quotes, invoices)

List pages are single-column. The content is naturally constrained by the sidebar + PageWrapper max-width.

```svelte
<PageWrapper title="Quotes" subtitle="Drafts, sent, viewed, accepted">
  {#snippet actions()}
    <Button>New quote</Button>
  {/snippet}

  <div class="space-y-4">
    <!-- Search bar -->
    <ListSearchBar bind:value={search} placeholder="Search..." />

    <!-- Filter tabs -->
    <FilterTabs bind:group />

    <!-- Content: skeleton, error, empty state, or list -->
    {#if showSkeleton}
      <SkeletonLoader lines={6} height="84px" />
    {:else if items.length === 0}
      <EmptyState icon={FileText} title="No quotes yet" ... />
    {:else}
      <ul class="grid gap-3">
        {#each items as item (item.id)}
          <li><QuoteListItem {item} /></li>
        {/each}
      </ul>
    {/if}
  </div>
</PageWrapper>
```

---

## Detail Page Layout — TWO-COLUMN on Desktop (REQUIRED)

**This is the most important pattern.** Contact, quote, invoice, job, and appointment detail pages MUST use a two-column layout on `lg:` screens. Single-column detail pages look like mobile apps on a desktop — unprofessional and wasteful.

### The Pattern

```svelte
<PageWrapper title="Q-0042" back="/quotes">
  {#snippet actions()}
    <JetEngineButton label="Save" ... />
    <Button variant="outline">Send</Button>
  {/snippet}

  <!-- TWO-COLUMN GRID -->
  <div class="grid gap-6 lg:grid-cols-[1fr_320px]">

    <!-- LEFT COLUMN: Main content (form fields, line items, notes) -->
    <div class="space-y-4">
      <!-- Document header card -->
      <!-- Form fields card -->
      <!-- Line items section -->
      <!-- Notes -->
    </div>

    <!-- RIGHT COLUMN: Sidebar (totals, status, timeline, quick actions) -->
    <div class="space-y-4">
      <!-- Totals card -->
      <!-- Status / info card -->
      <!-- History timeline -->
      <!-- Attachments -->
    </div>

  </div>
</PageWrapper>
```

The right sidebar column is `320px` fixed on desktop. The left column takes `1fr` (all remaining space).  
On mobile (`< lg`), the grid stacks into a single column automatically.

### What Goes Left vs Right

**Left column (main content):**
- Document header: status badge, client name, key meta (number, dates)
- Editable fields: title, notes, tax rate, expiry date
- Line items editor
- Internal notes (staff-only)
- Alert banners (change requests, expired notices)

**Right column (sidebar):**
- Totals card (subtotal, tax, total, deposit)
- Quick actions if not already in header
- Deposit status
- History/activity timeline
- File attachments

### Variant: Sidebar at 360px for wider content

For quote/invoice detail where the right sidebar needs more room:

```svelte
<div class="grid gap-6 lg:grid-cols-[1fr_360px]">
```

### Variant: Three columns for settings or dashboards

```svelte
<div class="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
```

---

## Detail Page Document Header Card

The first card on a detail page should serve as the document header — shows who it's for, what it is, and its current status at a glance. This is what Jobber and HousecallPro show prominently.

```svelte
<!-- Document header card — top of left column on detail pages -->
<div class="rounded-xl border border-border/60 bg-card p-4 shadow-card">
  <div class="flex items-start justify-between gap-3">

    <!-- Left: client + meta -->
    <div class="min-w-0 flex-1">
      <!-- Status + view count row -->
      <div class="flex flex-wrap items-center gap-2">
        <QuoteStatusBadge status={q.status} />
        {#if q.viewed_at}
          <span class="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Eye class="h-3 w-3" />{q.view_count} view{q.view_count === 1 ? '' : 's'}
          </span>
        {/if}
      </div>

      <!-- Client name — prominent -->
      <p class="mt-2 text-base font-semibold text-foreground">{q.contact_name}</p>
      <p class="text-sm text-muted-foreground">
        {q.contact_phone}{q.contact_email ? ` · ${q.contact_email}` : ''}
      </p>

      <!-- Document dates -->
      <div class="mt-3 flex flex-wrap gap-4">
        {#if q.created_at}
          <div>
            <p class="text-xs text-muted-foreground">Issued</p>
            <p class="text-sm font-medium text-foreground">
              {new Date(q.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </p>
          </div>
        {/if}
        {#if q.expires_at}
          <div>
            <p class="text-xs text-muted-foreground">Expires</p>
            <p class="text-sm font-medium text-foreground">
              {new Date(q.expires_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </p>
          </div>
        {/if}
        {#if q.accepted_at}
          <div>
            <p class="text-xs text-muted-foreground">Accepted</p>
            <p class="text-sm font-medium text-emerald-600 dark:text-emerald-400">
              {new Date(q.accepted_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </p>
          </div>
        {/if}
      </div>
    </div>

    <!-- Right: destructive icon button (delete, etc.) -->
    <button type="button" class="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-destructive">
      <Trash2 class="h-4 w-4" />
    </button>
  </div>
</div>
```

---

## Form Layout Pattern (create/edit forms)

Forms use grouped sections, not a flat list of fields. Group related fields into cards with clear labels.

```svelte
<PageWrapper title="New quote" back="/quotes">
  <!-- Save button in header via actions snippet -->

  <div class="grid gap-6 lg:grid-cols-[1fr_320px]">

    <!-- Left: form sections -->
    <div class="space-y-4">

      <!-- Section 1: Who is this for -->
      <div class="rounded-xl border border-border/60 bg-card p-4 shadow-card">
        <h2 class="mb-4 text-sm font-semibold text-foreground">Client</h2>
        <!-- contact picker -->
      </div>

      <!-- Section 2: Document details -->
      <div class="rounded-xl border border-border/60 bg-card p-4 shadow-card">
        <h2 class="mb-4 text-sm font-semibold text-foreground">Details</h2>
        <div class="grid gap-4">
          <div class="grid gap-2">
            <Label for="title">Title <span class="text-destructive">*</span></Label>
            <Input id="title" bind:value={title} />
          </div>
          <!-- more fields -->
        </div>
      </div>

      <!-- Section 3: Line items -->
      <div class="space-y-3">
        <div class="flex items-center justify-between">
          <h2 class="text-sm font-semibold text-foreground">Line items</h2>
          <Button variant="outline" size="sm">Apply template</Button>
        </div>
        <LineItemEditor bind:lineItems />
      </div>

    </div>

    <!-- Right: summary + payment terms -->
    <div class="space-y-4">
      <QuoteTotalsCard ... />
      <!-- deposit card, validity card -->
    </div>

  </div>
</PageWrapper>
```

---

## Dashboard / Stats Row

Stats/KPI cards use a responsive grid that adapts from 2 columns on mobile to 4 on desktop.

```svelte
<div class="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4">
  <StatCard title="Revenue" value={revenue} icon={DollarSign} trend="+12%" />
  <StatCard title="Open quotes" value={openQuotes} icon={FileText} />
  <StatCard title="Active jobs" value={activeJobs} icon={Wrench} />
  <StatCard title="Acceptance rate" value="68%" icon={TrendingUp} />
</div>
```

---

## Settings Page Layout

Settings pages use a two-column layout with a left nav and right content panel:

```svelte
<PageWrapper title="Settings">
  <div class="grid gap-6 lg:grid-cols-[220px_1fr]">

    <!-- Left: settings nav -->
    <nav class="space-y-1">
      <a href="/settings/profile" class="...">Profile</a>
      <a href="/settings/billing" class="...">Billing</a>
    </nav>

    <!-- Right: setting section content -->
    <div class="space-y-4">
      <!-- cards per settings group -->
    </div>

  </div>
</PageWrapper>
```

---

## Sticky Right Sidebar (for very long detail pages)

When the right sidebar has short content and the left column is very long (many line items), make the sidebar sticky:

```svelte
<div class="grid gap-6 lg:grid-cols-[1fr_320px]">

  <div class="space-y-4">
    <!-- long left content -->
  </div>

  <!-- Sticky sidebar — stays visible as you scroll the left column -->
  <div class="space-y-4 lg:sticky lg:top-[calc(var(--header-height)+1rem)] lg:self-start">
    <QuoteTotalsCard ... />
    <QuoteHistoryTimeline ... />
  </div>

</div>
```

The `lg:self-start` prevents the sidebar from stretching to full column height, and `lg:sticky` with `top` offset accounts for the sticky PageWrapper header.

---

## Full-width Content with Constrained Reading Width

For pages with long-form text or forms that benefit from a constrained width on very wide screens:

```svelte
<PageWrapper title="Profile">
  <div class="mx-auto max-w-2xl space-y-4">
    <!-- content constrained to ~672px max -->
  </div>
</PageWrapper>
```

Use `max-w-2xl` (672px) for single-column form pages, `max-w-3xl` (768px) for wider content.  
Do NOT over-constrain data-rich pages (quote detail, job detail) — they should use the full two-column layout.

---

## Mobile-Specific Patterns

On mobile (`< md`), all two-column grids collapse to single column automatically.  
Additional mobile-only considerations:

```
Bottom nav clearance:  pb-[calc(var(--bottom-nav-height)+env(safe-area-inset-bottom))]
                       Already applied in the (app) layout — do not add again on page level.

Tap targets:           min-h-touch (44px) on all buttons and interactive rows

Sheet (bottom):        Use BottomSheet for mobile action menus — never full dialogs
                       that open from center (too small on phone screens)

List item height:      min-h-[68px] for comfortable thumb taps on list rows
```

---

## Anti-Patterns to Avoid

```
✗ Single-column layout on detail pages at desktop size
✗ max-w-[400px] or similar narrow constraints on a 1280px screen
✗ Repeating the outer max-w-screen-xl wrapper — PageWrapper already provides it
✗ Putting totals/summary below a long list of line items instead of in a sidebar
✗ Putting the sticky header offset wrong — use top-[calc(var(--header-height)+1rem)]
   not top-0 for sticky sidebar (otherwise it slides under the sticky page header)
✗ Making the right sidebar column wider than 380px (it compresses the main content too much)
✗ Using a flat vertical stack of cards with no visual grouping on desktop
```
