# Component Aesthetics — Contractor Growth OS

> This reference was copied from the old Claude skill and may mention Tailwind and shadcn-svelte.
> For this repo, translate examples into Bits UI + SCSS and follow `AGENTS.md` when there is any conflict.
>
> Read this for how specific components should look and feel.
> All components use shadcn-svelte from `$lib/components/ui/*`.
> All class composition uses `cn()` from `$lib/utils`.

---

## Surface Hierarchy

Four layers. Every element must sit on exactly one of these:

```
LIGHT MODE:
  Layer 0 — Sidebar (bg-sidebar = gray-50)           ← navigation rail
  Layer 1 — Page / Content (bg-background = white)   ← main content area
  Layer 2 — Card (bg-card = white + border + shadow) ← floats on the page
  Layer 3 — Popover / Modal (bg-popover + shadow-modal) ← highest elevation

DARK MODE:
  Layer 0 — Page (bg-background = zinc-950)          ← deepest
  Layer 1 — Sidebar (bg-sidebar = slightly lighter)  ← nav rail
  Layer 2 — Card (bg-card = zinc-900 + border)       ← surfaces
  Layer 3 — Popover / Modal                           ← highest elevation
```

Rule: Never put a card inside another card of the same bg.
If nesting is needed, use bg-muted for the inner surface.
The sidebar is ALWAYS bg-sidebar, never bg-background or bg-card.

---

## Card Patterns

### Standard List Card (contacts, jobs, invoices)

```svelte
<!-- Light-mode first. Clean white card with very soft border. -->
<div
	class="
  group
  flex items-center gap-3
  rounded-lg border border-border/60 bg-card px-4 py-3
  shadow-card
  cursor-pointer
  transition-all duration-150 ease-out
  hover:border-border hover:bg-muted/40 hover:shadow-dropdown
"
>
	<!-- Avatar with initials -->
	<div
		class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-sm font-semibold"
	>
		JS
	</div>

	<!-- Content -->
	<div class="min-w-0 flex-1">
		<p class="truncate text-sm font-medium text-foreground">Jane Smith</p>
		<p class="truncate text-xs text-muted-foreground">jane@example.com · +1 555 0100</p>
	</div>

	<!-- Right side: status + chevron -->
	<div class="flex shrink-0 items-center gap-2">
		<StatusBadge status="active" />
		<ChevronRight
			class="h-4 w-4 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5"
		/>
	</div>
</div>
```

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

- Revenue / financial → `bg-primary/10` with `text-primary` (indigo)
- Active projects → `bg-blue-50 dark:bg-blue-500/10` with `text-blue-600 dark:text-blue-400`
- Completed tasks → `bg-green-50 dark:bg-green-500/10` with `text-green-600 dark:text-green-400`
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
  shadow-xl shadow-black/40
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
  px-0 pb-safe
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

Always use these exact class combinations. Never use shadcn's default Badge variants for status — override with these.

```svelte
<!-- Status badge helper pattern — build a StatusBadge component -->
<script lang="ts">
	import { Badge } from '$lib/components/ui/badge';
	import { cn } from '$lib/utils';

	type Status =
		| 'active'
		| 'lead'
		| 'inactive'
		| 'pending'
		| 'overdue'
		| 'draft'
		| 'paid'
		| 'sent'
		| 'accepted'
		| 'declined';

	let { status } = $props<{ status: Status }>();

	const statusConfig: Record<Status, { label: string; classes: string }> = {
		active: {
			label: 'Active',
			classes:
				'bg-green-50 text-green-700 border-green-200 dark:bg-green-500/10 dark:text-green-400 dark:border-green-500/20'
		},
		lead: {
			label: 'Lead',
			classes:
				'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-500/10 dark:text-sky-400 dark:border-sky-500/20'
		},
		inactive: {
			label: 'Inactive',
			classes:
				'bg-slate-100 text-slate-600 border-slate-200 dark:bg-zinc-500/10 dark:text-zinc-400 dark:border-zinc-500/20'
		},
		pending: {
			label: 'Pending',
			classes:
				'bg-amber-50 text-amber-700 border-amber-200 dark:bg-yellow-500/10 dark:text-yellow-400 dark:border-yellow-500/20'
		},
		overdue: {
			label: 'Overdue',
			classes:
				'bg-red-50 text-red-700 border-red-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20'
		},
		draft: {
			label: 'Draft',
			classes:
				'bg-slate-100 text-slate-600 border-slate-200 dark:bg-zinc-500/10 dark:text-zinc-400 dark:border-zinc-500/20'
		},
		paid: {
			label: 'Paid',
			classes:
				'bg-green-50 text-green-700 border-green-200 dark:bg-green-500/10 dark:text-green-400 dark:border-green-500/20'
		},
		sent: {
			label: 'Sent',
			classes:
				'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/20'
		},
		accepted: {
			label: 'Accepted',
			classes:
				'bg-green-50 text-green-700 border-green-200 dark:bg-green-500/10 dark:text-green-400 dark:border-green-500/20'
		},
		declined: {
			label: 'Declined',
			classes:
				'bg-red-50 text-red-700 border-red-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20'
		}
	};

	const config = statusConfig[status] ?? {
		label: status,
		classes: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20'
	};
</script>

<Badge class={cn('border text-xs font-medium', config.classes)}>
	{config.label}
</Badge>
```

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
