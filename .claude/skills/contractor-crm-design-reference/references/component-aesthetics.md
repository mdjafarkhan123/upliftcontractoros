# Component Aesthetics — Contractor Growth OS

> Read this for how specific components should look and feel.
> All components use shadcn-svelte from `$lib/components/ui/*`.
> All class composition uses `cn()` from `$lib/utils`.

---

## Surface Hierarchy

Four layers. Every element must sit on exactly one of these:

```
LIGHT MODE:
  Layer 0 — Sidebar (bg-sidebar = gray-50)               ← navigation rail
  Layer 1 — Page / Content (bg-background = white)       ← main content area
  Layer 2 — Card (bg-card = white + border + shadow-card)← floats on the page
  Layer 3 — Popover / Modal (bg-popover + shadow-modal)  ← highest elevation

DARK MODE:
  Layer 0 — Page (bg-background = deep navy #080C14)     ← deepest
  Layer 1 — Sidebar (bg-sidebar = slightly lighter navy) ← nav rail
  Layer 2 — Card (bg-card = navy + border + shadow-card) ← surfaces
  Layer 3 — Popover / Modal                              ← highest elevation

  Dark mode depth is created by the inset top-highlight shadow technique,
  not by lightening the card background significantly.
```

Rule: Never put a card inside another card of the same bg.
If nesting is needed, use bg-muted for the inner surface.
The sidebar is ALWAYS bg-sidebar, never bg-background or bg-card.

---

## Card Patterns

### Standard List Card (contacts, jobs, invoices)

Used on mobile. On desktop, these are replaced by the data table (`ContactTable`, `JobTable`, etc.).
The card is the `<a>` or `<button>` element — the whole surface is the tap target.

```svelte
<!-- Mobile list card — rounded-xl, primary/30 hover border, card-raised hover bg -->
<a
	href="/contacts/{id}"
	class="
  group block rounded-xl
  border border-border/70 bg-card p-4
  shadow-card
  transition-all duration-150 ease-out
  hover:border-primary/30 hover:bg-card-raised hover:shadow-dropdown
  active:bg-muted/70
  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring
  dark:border-white/10
"
>
	<div class="flex items-start gap-3">
		<!-- Status-colored avatar ring (see Avatar Ring System below) -->
		<div class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary ring-1 ring-primary/15">
			JS
		</div>
		<div class="min-w-0 flex-1">
			<div class="flex items-start justify-between gap-2">
				<h3 class="truncate text-base font-semibold text-foreground">Jane Smith</h3>
				<Badge variant="info" label="Lead" />
			</div>
			<p class="truncate text-sm text-muted-foreground">+1 555 0100</p>
			<p class="truncate text-xs text-muted-foreground">jane@example.com</p>
		</div>
	</div>
</a>
```

**Key hover rule**: cards use `hover:border-primary/30 hover:bg-card-raised` — a subtle brand-tinted border lift, not a gray fill. This distinguishes them from table rows which use `hover:bg-muted/20`.

### Avatar Ring System — Status-Coded Colors

Avatar rings are **never a single color**. They are always coded to the record's status so the user can scan the list without reading the badge.

```svelte
<!-- Use this helper function in any component that renders avatars -->
function avatarRingClass(status: string) {
	return status === 'customer' || status === 'active'
		? 'bg-emerald-500/10 text-emerald-700 ring-emerald-500/20 dark:text-emerald-400'
		: status === 'archived'
			? 'bg-amber-500/10 text-amber-700 ring-amber-500/20 dark:text-amber-400'
			: status === 'inactive'
				? 'bg-slate-100 text-slate-500 ring-slate-200 dark:bg-slate-500/10 dark:text-slate-400 dark:ring-slate-500/20'
				: 'bg-primary/10 text-primary ring-primary/15'; // lead / new / default
}

<!-- In the template — always use ring-1 with the status class -->
<div class={cn(
	'flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold ring-1',
	avatarRingClass(status)
)}>
	{initials}
</div>
```

| Status | Ring color | Why |
|---|---|---|
| `lead` / `new` / default | Green (`bg-primary/10 text-primary ring-primary/15`) | Brand color — this is a potential customer |
| `customer` / `active` | Emerald (`bg-emerald-500/10 text-emerald-700 ring-emerald-500/20`) | Confirmed active — strong green signal |
| `archived` | Amber (`bg-amber-500/10 text-amber-700 ring-amber-500/20`) | Dormant but recoverable — amber signals "attention needed" |
| `inactive` | Slate (`bg-slate-100 text-slate-500 ring-slate-200`) | Neutral grey — no action expected, not urgent |

**Why inactive ≠ archived**: `inactive` is a quiet neutral state (no action needed, just not active). `archived` signals the record was deliberately put away and may need reactivation. Amber on archived helps contractors spot recoverable contacts. Grey on inactive avoids false urgency.

Apply this in both the mobile card and the desktop table. The visual consistency reinforces status at a glance across both views.

---

### Action Menu Reveal Pattern

Table row action menus (`⋮`) are invisible by default and reveal on row hover. This keeps the table visually clean while keeping actions one click away.

```svelte
<!-- On the <tr> -->
<tr class="group transition-colors hover:bg-muted/20">

<!-- On the ⋮ trigger button -->
<DropdownMenu.Trigger
	class={cn(
		'inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground',
		'transition-all hover:bg-accent hover:text-foreground',
		'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
		'opacity-0 group-hover:opacity-100 focus-visible:opacity-100'  ← the key line
	)}
>
	<MoreHorizontal class="h-4 w-4" />
</DropdownMenu.Trigger>
```

Rules:
- Always `opacity-0 group-hover:opacity-100 focus-visible:opacity-100` — keyboard users can still reach it
- The `<td>` containing the button needs `onclick={(e) => e.stopPropagation()}` to prevent row-level click handlers (select mode) from firing when the menu opens
- In select mode, hide the `⋮` menu entirely (`{#if !selectable}`) — the row click toggles selection

---

### Stat Card (dashboard KPIs)

```svelte
<!-- Clean minimal KPI card — icon badge top-right, number, trend chip below -->
<!-- No gradient line. No hover lift. Clean white surface. -->
<Card.Root
	class="
  border border-border/60 bg-card shadow-card
  transition-shadow duration-200 hover:shadow-dropdown
"
>
	<Card.Content class="p-5">
		<div class="flex items-start justify-between gap-4">
			<!-- Left: label + number + trend -->
			<div class="min-w-0">
				<p class="text-xs font-medium text-muted-foreground">Revenue this month</p>
				<p class="mt-2 text-2xl font-bold tracking-tight text-foreground">$24,500</p>
				<!-- Trend chip -->
				<div
					class="mt-1.5 inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 dark:bg-green-500/10"
				>
					<TrendingUp class="h-3 w-3 text-green-600 dark:text-green-400" />
					<span class="text-xs font-medium text-green-700 dark:text-green-400">+12.5%</span>
					<span class="text-xs text-muted-foreground">from last month</span>
				</div>
			</div>

			<!-- Right: icon badge -->
			<div class="rounded-lg bg-primary/10 p-2.5 shrink-0">
				<DollarSign class="h-5 w-5 text-primary" />
			</div>
		</div>
	</Card.Content>
</Card.Root>
```

**Icon badge color variants for different KPI cards**:

- Revenue / financial → `bg-primary/10` with `text-primary` (brand green)
- Active contacts/jobs → `bg-blue-50 dark:bg-blue-500/10` with `text-blue-600 dark:text-blue-400`
- Completed / paid → `bg-emerald-50 dark:bg-emerald-500/10` with `text-emerald-600 dark:text-emerald-400`
- Overdue / alerts → `bg-red-50 dark:bg-red-500/10` with `text-red-600 dark:text-red-400`
- Pending / upcoming → `bg-amber-50 dark:bg-amber-500/10` with `text-amber-600 dark:text-amber-400`

### Detail Card (contact detail, job detail)

```svelte
<Card.Root class="border-border/50">
	<Card.Header class="pb-3">
		<div class="flex items-center justify-between">
			<Card.Title class="text-base font-semibold">Contact Details</Card.Title>
			<Button variant="ghost" size="icon" class="h-8 w-8 text-muted-foreground">
				<Pencil class="h-4 w-4" />
			</Button>
		</div>
	</Card.Header>
	<Separator />
	<Card.Content class="pt-4">
		<!-- Field rows -->
		<div class="space-y-3">
			<div class="flex justify-between text-sm">
				<span class="text-muted-foreground">Phone</span>
				<span class="font-medium text-foreground">+1 555 0100</span>
			</div>
			<div class="flex justify-between text-sm">
				<span class="text-muted-foreground">Email</span>
				<span class="font-medium text-foreground">jane@example.com</span>
			</div>
			<div class="flex justify-between text-sm">
				<span class="text-muted-foreground">Status</span>
				<Badge class="bg-green-500/10 text-green-400 border-green-500/20 text-xs">Active</Badge>
			</div>
		</div>
	</Card.Content>
</Card.Root>
```

---

## Dialog & Sheet

### Confirm Dialog — Danger variant

```svelte
<Dialog.Content
	class="
  border-border/50 bg-card
  shadow-modal
  sm:max-w-[400px]
"
>
	<Dialog.Header>
		<div class="flex items-center gap-3">
			<!-- Icon badge for danger -->
			<div class="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10">
				<AlertTriangle class="h-5 w-5 text-destructive" />
			</div>
			<div>
				<Dialog.Title class="text-base font-semibold">Delete Contact</Dialog.Title>
				<Dialog.Description class="text-sm text-muted-foreground">
					This cannot be undone.
				</Dialog.Description>
			</div>
		</div>
	</Dialog.Header>
	<Dialog.Footer class="mt-2">
		<Dialog.Close>
			<Button variant="outline" class="border-border/50">Cancel</Button>
		</Dialog.Close>
		<Button variant="destructive" onclick={handleDelete}>Delete</Button>
	</Dialog.Footer>
</Dialog.Content>
```

### Bottom Sheet — Mobile action drawer

```svelte
<Sheet.Content
	side="bottom"
	class="
  rounded-t-2xl border-border/50 bg-card
  px-0 pb-[env(safe-area-inset-bottom)]
"
>
	<!-- Pull handle -->
	<div class="mx-auto mt-3 h-1.5 w-12 rounded-full bg-border" />

	<Sheet.Header class="px-6 pt-4 pb-2">
		<Sheet.Title class="text-base font-semibold">More Options</Sheet.Title>
	</Sheet.Header>

	<!-- Action list -->
	<div class="flex flex-col px-2 pb-4">
		<!-- action item pattern -->
		<button
			class="
      flex items-center gap-3 rounded-lg px-4 py-3
      text-sm text-foreground
      transition-colors duration-150
      hover:bg-accent
    "
		>
			<Pencil class="h-4 w-4 text-muted-foreground" />
			Edit contact
		</button>

		<!-- Danger action -->
		<button
			class="
      flex items-center gap-3 rounded-lg px-4 py-3
      text-sm text-destructive
      transition-colors duration-150
      hover:bg-destructive/10
    "
		>
			<Trash2 class="h-4 w-4" />
			Delete contact
		</button>
	</div>
</Sheet.Content>
```

---

## Badge Variants — Status System

The project uses `$lib/components/shared/Badge.svelte` — **not** shadcn's `Badge` and not a `StatusBadge` component.
It accepts a `variant` prop and a `label` prop.

```svelte
import Badge from '$lib/components/shared/Badge.svelte';

<!-- Contacts -->
<Badge variant="info" label="Lead" />        <!-- blue — lead -->
<Badge variant="success" label="Customer" /> <!-- green — customer -->
<Badge variant="warning" label="Archived" /> <!-- amber — archived -->

<!-- Jobs / Invoices / Quotes -->
<Badge variant="success" label="Paid" />
<Badge variant="warning" label="Overdue" />
<Badge variant="default" label="Draft" />
<Badge variant="info" label="Sent" />
<Badge variant="destructive" label="Cancelled" />
```

### Variant → Color mapping

| Variant | Color | Use for |
|---|---|---|
| `success` | Emerald green | Customer, Paid, Completed, Active |
| `info` | Indigo/blue | Lead, Sent, In Progress |
| `warning` | Amber | Archived, Overdue, Pending |
| `destructive` | Red | Cancelled, Failed, Declined |
| `default` | Muted gray | Draft, Inactive, Unknown |

**Rule**: match the variant to the semantic meaning, not the label text. "Overdue" is `warning` (amber) not `destructive` (red) — red is reserved for cancellations and hard failures.

---

## Form Field Aesthetics

```svelte
<!-- Field wrapper -->
<div class="space-y-1.5">
	<Label for="name" class="text-sm font-medium text-foreground">
		Full name <span class="text-destructive">*</span>
	</Label>
	<Input
		id="name"
		type="text"
		placeholder="Jane Smith"
		bind:value={form.full_name}
		class={cn(
			'bg-card border-border/50',
			'focus:border-primary focus:ring-primary/20',
			'placeholder:text-muted-foreground/50',
			errors.full_name && 'border-destructive/50 focus:border-destructive focus:ring-destructive/20'
		)}
	/>
	{#if errors.full_name}
		<p class="flex items-center gap-1 text-xs text-destructive">
			<AlertCircle class="h-3 w-3" />
			{errors.full_name}
		</p>
	{/if}
</div>
```

---

## Navigation — Bottom Nav (Mobile)

```svelte
<nav
	class="
  fixed bottom-0 inset-x-0 z-50
  flex items-center justify-around
  h-[var(--bottom-nav-height)] px-2
  bg-card/95 backdrop-blur-xl
  border-t border-border/50
  safe-area-pb
"
>
	<!-- Nav item pattern -->
	<a
		href="/dashboard"
		class={cn(
			'flex flex-col items-center gap-0.5 rounded-lg px-3 py-2 min-h-[44px] justify-center',
			'text-xs font-medium transition-colors duration-150',
			isActive('/dashboard') ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
		)}
	>
		<LayoutDashboard class={cn('h-5 w-5', isActive('/dashboard') && 'text-primary')} />
		Dashboard
	</a>
</nav>
```

---

## Sidebar Search Input

A search input embedded in the sidebar, above the nav groups.
Different from the command palette — this filters the current section, not global search.

```svelte
<!-- Sidebar search — sits between logo and nav groups -->
<div class="px-3 py-2.5 border-b border-border/60">
	<div class="relative">
		<Search
			class="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/60"
		/>
		<input
			type="text"
			placeholder="Search..."
			bind:value={sidebarSearch}
			class="
        w-full h-8 rounded-md
        bg-background border border-border/60
        pl-8 pr-3 text-sm
        text-foreground placeholder:text-muted-foreground/50
        transition-colors duration-150
        focus:outline-none focus:ring-1 focus:ring-ring focus:border-input
      "
		/>
	</div>
</div>
```

**Note**: On desktop sidebar, this is a compact `h-8` input with `bg-background` (white) so it
lifts slightly off the `bg-sidebar` (gray-50) surface — creating visual depth without a card.

---

## Empty State — Designed

```svelte
<!-- src/lib/components/shared/EmptyState.svelte -->
<div class="flex flex-col items-center justify-center py-16 px-6 text-center">
	<!-- Icon container -->
	<div class="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
		<Users class="h-7 w-7 text-muted-foreground" />
	</div>

	<h3 class="text-base font-semibold text-foreground">{title}</h3>

	{#if description}
		<p class="mt-1.5 max-w-xs text-sm text-muted-foreground">{description}</p>
	{/if}

	{#if actionLabel && onAction}
		<Button onclick={onAction} class="mt-6" size="default">
			{actionLabel}
		</Button>
	{/if}
</div>
```

---

## Advanced Button & Hover Effects

These are defined in `app.css` and available globally. Use them sparingly for high-impact interactions only.

### Snake Glow — Power CTA hover effect

A rotating conic-gradient border that glows on hover. Use on the single most important CTA on a page (e.g. "Send Quote", "Collect Payment"). **Never use on more than one element per screen.**

```svelte
<!-- Apply .snake-glow to the wrapping element -->
<button class="snake-glow rounded-xl bg-card border border-border/60 px-6 py-3 ...">
	Send Quote
</button>
```

The glow uses `--brand-light` (bright green) and `--brand-primary` (mid green) from the brand palette. It is invisible at rest and activates on `:hover` with a 0.35s fade-in.

### JetEngine Button — Loading state animation

A two-phase loading indicator: spool-up (accelerating rotation over 1.4s) followed by continuous spin. Used in place of a standard spinner for primary async actions to communicate "something powerful is happening."

```svelte
<!-- Apply these classes to the icon inside the button when loading -->
<svg class="animate-spool-up h-4 w-4">...</svg>

<!-- Success state — pop-in checkmark -->
<svg class="animate-pop-in h-4 w-4">...</svg>
```

Both `animate-spool-up` and `animate-pop-in` are defined in `app.css`. Never apply them to text or containers — only to SVG icons inside buttons.

---

## Page Header Pattern

```svelte
<!-- Sticky page header — transparent frosted glass over scrolling content -->
<header
	class="
  sticky top-0 z-40
  flex items-center justify-between
  h-[var(--header-height)] px-6
  bg-background/90 backdrop-blur-md
  border-b border-border/60
"
>
	<div>
		<h1 class="text-lg font-semibold tracking-tight text-foreground">{title}</h1>
		{#if subtitle}
			<p class="text-xs text-muted-foreground">{subtitle}</p>
		{/if}
	</div>

	<!-- Right side actions slot -->
	{@render actions?.()}
</header>
```
