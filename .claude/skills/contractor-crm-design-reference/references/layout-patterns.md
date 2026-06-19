# Layout Patterns — Contractor Growth OS

> Read this when building page layouts, the app shell, sidebar nav, or command palette.
> Mobile-first always. Base = 375px.
>
> **Breakpoint guide:**
> - `md` (768px) — app shell: sidebar appears, bottom nav hides, main content gets left margin
> - `lg` (1024px) — list pages: data table appears, mobile cards hide (`hidden lg:block` / `lg:hidden`)
> - `xl` (1280px) — table columns: email + assignee columns appear
> - `2xl` (1536px) — table columns: tags column appears
>
> Never use `md` as the table/card split — 768px is too narrow for a readable data table.

---

## App Shell — Responsive Layout

The app has **two navigation modes**:

- **Mobile** (< 768px): Fixed bottom nav + full-width content
- **Desktop** (≥ 768px): Sticky left sidebar + content with left margin

```svelte
<!-- src/routes/(app)/+layout.svelte — Shell structure -->
<script lang="ts">
	function navItemClass(active: boolean): string {
		return cn(
			'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors duration-150',
			active
				? 'bg-primary/10 text-primary font-medium'
				: 'text-muted-foreground font-normal hover:bg-accent hover:text-foreground'
		);
	}
</script>

<div class="min-h-screen bg-background">
	<!-- Desktop sidebar (hidden on mobile) -->
	<aside
		class="
    hidden md:flex
    fixed inset-y-0 left-0 z-50
    w-[var(--sidebar-width)]
    flex-col
    border-r border-border/60 bg-sidebar
  "
	>
		<!-- Logo / brand lockup -->
		<div class="flex h-[var(--header-height)] items-center gap-2.5 border-b border-border/60 px-4">
			<!-- Logo mark — replace with actual SVG logo -->
			<div
				class="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground"
			>
				<span class="text-xs font-bold">C</span>
			</div>
			<span class="text-sm font-semibold tracking-tight text-foreground">ContractorOS</span>
		</div>

		<!-- Nav links — with section groups -->
		<nav class="flex-1 overflow-y-auto px-2 py-3 space-y-4">
			<!-- MAIN MENU group -->
			<div>
				<p
					class="mb-1 px-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70"
				>
					Main Menu
				</p>
				<div class="space-y-0.5">
					<a href="/dashboard" class={navItemClass(isActive('/dashboard'))}>
						<LayoutDashboard class="h-4 w-4 shrink-0" />
						<span class="flex-1">Dashboard</span>
					</a>
					<a href="/contacts" class={navItemClass(isActive('/contacts'))}>
						<Users class="h-4 w-4 shrink-0" />
						<span class="flex-1">Contacts</span>
					</a>
					<!-- Add all primary nav items here following the same pattern -->
				</div>
			</div>

			<!-- MANAGEMENT group -->
			<div>
				<p
					class="mb-1 px-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70"
				>
					Management
				</p>
				<div class="space-y-0.5">
					<a href="/jobs" class={navItemClass(isActive('/jobs'))}>
						<Briefcase class="h-4 w-4 shrink-0" />
						<span class="flex-1">Jobs</span>
					</a>
					<a href="/invoices" class={navItemClass(isActive('/invoices'))}>
						<FileText class="h-4 w-4 shrink-0" />
						<span class="flex-1">Invoices</span>
						<!-- Count badge — use primary for standard counts, amber for urgency (overdue) -->
						{#if unpaidCount > 0}
							<span
								class="ml-auto rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold text-primary"
							>
								{unpaidCount}
							</span>
						{/if}
					</a>
				</div>
			</div>
		</nav>

		<!-- Bottom: user profile -->
		<div class="border-t border-border/60 p-3">
			<button
				class="
        flex w-full items-center gap-3 rounded-lg px-2 py-2
        transition-colors duration-150 hover:bg-accent
        text-left
      "
			>
				<!-- Avatar with initials fallback -->
				<div
					class="
          flex h-8 w-8 shrink-0 items-center justify-center
          rounded-full bg-primary/10 text-primary text-xs font-semibold
        "
				>
					{memberInitials}
				</div>
				<div class="min-w-0 flex-1">
					<p class="truncate text-sm font-medium text-foreground">{memberName}</p>
					<p class="truncate text-xs text-muted-foreground">{orgName}</p>
				</div>
				<Settings class="h-4 w-4 shrink-0 text-muted-foreground" />
			</button>
		</div>
	</aside>

	<!-- Main content — offset by sidebar on desktop, white surface -->
	<main
		class="
    min-h-screen bg-background
    md:ml-[var(--sidebar-width)]
    pb-[var(--bottom-nav-height)]
    md:pb-0
  "
	>
		{@render children()}
	</main>

	<!-- Mobile bottom nav (hidden on desktop) -->
	<nav class="md:hidden fixed bottom-0 inset-x-0 z-50 ...">
		<!-- see component-aesthetics.md -->
	</nav>
</div>
```

### Sidebar Nav Item

```svelte
<!-- Add this to app.css as a @layer component, or inline in sidebar -->
<a
	{href}
	class={cn(
		'flex items-center gap-3 rounded-md px-3 py-2',
		'text-sm font-medium',
		'transition-colors duration-150',
		isActive
			? 'bg-primary/10 text-primary'
			: 'text-muted-foreground hover:bg-accent hover:text-foreground'
	)}
>
	<Icon class="h-4 w-4 shrink-0" />
	{label}
	{#if badge}
		<span
			class="ml-auto rounded-full bg-primary/20 px-1.5 py-0.5 text-[10px] font-semibold text-primary"
		>
			{badge}
		</span>
	{/if}
</a>
```

---

## Page Wrapper — Standard Page Layout

```svelte
<!-- src/lib/components/shared/PageWrapper.svelte -->
<script lang="ts">
	import type { Snippet } from 'svelte';

	let { title, subtitle, children, actions } = $props<{
		title: string;
		subtitle?: string;
		children: Snippet;
		actions?: Snippet;
	}>();
</script>

<div class="flex flex-col min-h-full">
	<!-- Sticky page header -->
	<header
		class="
    sticky top-0 z-40
    flex items-center justify-between
    h-[var(--header-height)] px-4 md:px-6
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
		{#if actions}
			<div class="flex items-center gap-2">
				{@render actions()}
			</div>
		{/if}
	</header>

	<!-- Page content — 16px mobile, 24px desktop -->
	<div class="flex-1 px-4 md:px-6 py-4">
		{@render children()}
	</div>
</div>
```

---

## Settings & Form Pages — Desktop Treatment (DO NOT ship mobile-only)

> **Mobile-first ≠ mobile-only.** A single stacked column of full-bleed cards is the
> *mobile* layout. If you ship that same layout untouched on desktop it looks like a
> blown-up phone screen — this is a defect, not a neutral default. Every settings /
> form / config page MUST add a desktop treatment on top of the mobile stack.

**Non-negotiables for any settings or multi-section form page:**

1. **Centre the content with a max-width.** Never let a form/settings page run wall-to-wall
   on desktop. Wrap the content in `mx-auto w-full max-w-3xl` (single-column forms) or
   `max-w-5xl` (card grids). Full-bleed text fields stretched across a 1440px monitor are
   the #1 "looks like mobile" tell.
2. **Use the horizontal space — multi-column at `lg`.** A list of independent setting cards
   becomes `grid grid-cols-1 lg:grid-cols-2 gap-4`. Do not stack 10 cards in one column on
   desktop. (Keep the editor *inside* a card single-column for readability.)
3. **Collapse long, repeated content — accordions, not endless scroll.** If a page shows
   many sections or a card contains a variable number of sub-items (steps, rules, follow-ups),
   they MUST be collapsible. Default to collapsed with a one-line summary (status · count ·
   key setting) so the user can scan "how many / what state" at a glance, then expand to edit.
   Never render every section fully-expanded as one long wall.
4. **Cards get a real identity — big icon tile + title + status + summary.** A settings card
   header is an icon tile (`h-11 w-11`/`h-12 w-12 rounded-xl` with a colored accent —
   `bg-{accent}-50 text-{accent}-600 dark:bg-{accent}-500/10 dark:text-{accent}-400`), the
   title, a one-line description, and a meta/status line. A bare title + switch reads as a
   cheap mobile list row.
5. **"Add" affordances must look like buttons.** An add-item control is a clearly clickable
   button — `border-2 border-dashed` with an icon in a filled `rounded-full` chip and a bold
   label, plus a hover state (`hover:border-primary/50 hover:bg-primary/5`). A thin flat line
   of muted text is NOT a discoverable action.
6. **Cards expand to full width when opened in a grid.** In an `lg:grid-cols-2` card grid, the
   actively-expanded card takes `lg:col-span-2` so its editor isn't cramped into half a column.

Reference implementation: `src/routes/(app)/(pages)/settings/automation/+page.svelte` +
`src/lib/components/settings/automation/AutomationCardShell.svelte` (icon-tile accordion card),
`SequenceCard.svelte` / `SequenceStepEditor.svelte` (nested step accordion + add button).

---

## Content Grids

```svelte
<!-- Dashboard — 2-col on desktop, 1-col on mobile -->
<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
	<!-- stat cards -->
</div>

<!-- Stat cards row — 2-col mobile, 2-col tablet, 4-col desktop -->
<!-- IMPORTANT: Never md:grid-cols-4 — at 768px with 240px sidebar, each card
     would be only ~132px wide. Use lg:grid-cols-4 for 4-col layout. -->
<div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
	<!-- KPI cards -->
</div>

<!-- Detail page — full width list, sidebar on desktop -->
<div class="flex flex-col gap-4 md:flex-row md:items-start">
	<!-- Main content -->
	<div class="flex-1 min-w-0 space-y-4">
		<!-- primary content -->
	</div>
	<!-- Side panel (desktop only) -->
	<aside class="w-full md:w-72 shrink-0 space-y-4">
		<!-- metadata cards -->
	</aside>
</div>
```

---

## Two-Panel Split Layout (Inbox / Detail Pages)

Use this pattern for: Messages & Inbox, Contact detail with activity feed,
any page that has a list on the left and a detail view on the right.

```svelte
<!-- Two-panel split — lg+ only (1024px minimum). Mobile: list page → detail page (separate route) -->
<div class="hidden lg:flex h-[calc(100vh-var(--header-height))] overflow-hidden">
	<!-- Left panel: list / conversation index -->
	<div
		class="
    w-80 shrink-0 flex flex-col
    border-r border-border/60 bg-background
    overflow-hidden
  "
	>
		<!-- Panel header -->
		<div class="flex items-center justify-between border-b border-border/60 px-4 py-3">
			<h2 class="text-sm font-semibold text-foreground">Messages</h2>
			<Button variant="ghost" size="icon" class="h-7 w-7">
				<Plus class="h-4 w-4" />
			</Button>
		</div>

		<!-- Panel search -->
		<div class="border-b border-border/60 px-3 py-2.5">
			<div class="relative">
				<Search
					class="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
				/>
				<Input
					placeholder="Search..."
					class="h-8 pl-8 text-sm bg-muted border-0 focus-visible:ring-1"
				/>
			</div>
		</div>

		<!-- List of items — scrollable -->
		<div class="flex-1 overflow-y-auto">
			{#each items as item (item.id)}
				<button
					onclick={() => (selectedId = item.id)}
					class={cn(
						'w-full flex items-start gap-3 px-4 py-3 text-left border-b border-border/40',
						'transition-colors duration-150',
						selectedId === item.id
							? 'bg-primary/5 border-l-2 border-l-primary'
							: 'hover:bg-muted/60'
					)}
				>
					<!-- Avatar -->
					<div
						class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-sm font-semibold"
					>
						{item.initials}
					</div>
					<!-- Content -->
					<div class="min-w-0 flex-1">
						<div class="flex items-center justify-between gap-2">
							<p class="text-sm font-medium text-foreground truncate">{item.name}</p>
							<span class="text-[10px] text-muted-foreground shrink-0">{item.time}</span>
						</div>
						<p class="text-xs text-muted-foreground">{item.company}</p>
						<p class="mt-0.5 text-xs text-muted-foreground truncate">{item.preview}</p>
					</div>
					<!-- Unread badge -->
					{#if item.unread > 0}
						<span
							class="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground"
						>
							{item.unread}
						</span>
					{/if}
				</button>
			{/each}
		</div>
	</div>

	<!-- Right panel: detail / conversation view -->
	<div class="flex flex-1 flex-col overflow-hidden bg-background">
		{#if selectedItem}
			<!-- Detail header -->
			<div class="flex items-center justify-between border-b border-border/60 px-6 py-3">
				<div class="flex items-center gap-3">
					<div
						class="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary text-sm font-semibold"
					>
						{selectedItem.initials}
					</div>
					<div>
						<p class="text-sm font-semibold text-foreground">{selectedItem.name}</p>
						<p class="text-xs text-muted-foreground">{selectedItem.company}</p>
					</div>
				</div>
				<!-- Action icons -->
				<div class="flex items-center gap-1">
					<Button
						variant="ghost"
						size="icon"
						class="h-8 w-8 text-muted-foreground hover:text-foreground"
					>
						<Phone class="h-4 w-4" />
					</Button>
					<Button
						variant="ghost"
						size="icon"
						class="h-8 w-8 text-muted-foreground hover:text-foreground"
					>
						<Mail class="h-4 w-4" />
					</Button>
					<Button
						variant="ghost"
						size="icon"
						class="h-8 w-8 text-muted-foreground hover:text-foreground"
					>
						<MoreHorizontal class="h-4 w-4" />
					</Button>
				</div>
			</div>

			<!-- Scrollable message area -->
			<div class="flex-1 overflow-y-auto px-6 py-4 space-y-3">
				<!-- Messages rendered here -->
			</div>

			<!-- Compose area -->
			<div class="border-t border-border/60 px-4 py-3">
				<div class="flex items-end gap-2 rounded-xl border border-border bg-card px-3 py-2">
					<Textarea
						placeholder="Type a message..."
						class="min-h-[36px] max-h-32 flex-1 resize-none border-0 bg-transparent p-0 text-sm focus-visible:ring-0"
					/>
					<Button size="icon" class="h-8 w-8 shrink-0 rounded-lg">
						<Send class="h-3.5 w-3.5" />
					</Button>
				</div>
			</div>
		{:else}
			<!-- No selection empty state -->
			<div class="flex flex-1 items-center justify-center">
				<div class="text-center">
					<div class="mb-3 flex h-12 w-12 mx-auto items-center justify-center rounded-2xl bg-muted">
						<MessageSquare class="h-6 w-6 text-muted-foreground" />
					</div>
					<p class="text-sm font-medium text-foreground">Select a conversation</p>
					<p class="mt-1 text-xs text-muted-foreground">Choose from the list on the left</p>
				</div>
			</div>
		{/if}
	</div>
</div>
```

**Minimum viewport for two-panel**: This layout requires `lg+` (1024px) minimum. At `md` (768px) the
sidebar (240px) + left panel (320px) = 560px before the right panel, leaving only 208px — unusable.
Guard the entire two-panel with `hidden lg:flex` and show a single-column layout below `lg`.

**Mobile behavior**: On mobile (`< lg`), show only the list as a full-page route.
Tapping an item navigates to a separate detail route. Never show both panels stacked on mobile.

---

## Data Table Pattern

Use for: Contacts list (desktop), Invoices, Jobs — any list page at `lg+` breakpoint.
**Always use inline Tailwind classes, not `.data-table` / `.table-container` CSS utilities.**

### Rules
- Wrap in `overflow-hidden rounded-xl border border-border/70 bg-card shadow-card`
- Inner `overflow-x-auto` with `min-w-[640px]` on `<table>` to allow horizontal scroll on narrow desktop
- Header row: `bg-muted/30` + `border-b border-border/60`
- Column headers: `text-[11px] font-semibold uppercase tracking-wider text-muted-foreground`
- Body rows: `divide-y divide-border/30` on `<tbody>`, `hover:bg-muted/20` on `<tr>`
- Row hover reveals action menu: `opacity-0 group-hover:opacity-100` on the `⋮` button
- Action column: `w-12`, button `h-8 w-8`, uses `DropdownMenu`
- Select mode: entire `<tr>` becomes clickable (`onclick`), checkbox column appears, `⋮` menu hides

### Responsive column visibility
```
Always visible:   Contact (avatar + name)   Status
lg+ (1024px):     Phone
xl+ (1280px):     Email   Assignee
2xl+ (1536px):    Tags
```

### Full table component pattern

```svelte
<script lang="ts">
	import { goto } from '$app/navigation';
	import { cn } from '$lib/utils/cn';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import Badge from '$lib/components/shared/Badge.svelte';
	import { Check, MoreHorizontal } from '@lucide/svelte';

	// Items typed to the specific list item type (e.g. ContactListItem)
	let { items, selectable = false, selected, onToggleSelect, onToggleAll, allSelected = false } = $props();

	function avatarRingClass(status: string) {
		return status === 'customer' || status === 'active'
			? 'bg-emerald-500/10 text-emerald-700 ring-emerald-500/20 dark:text-emerald-400'
			: status === 'archived'
				? 'bg-amber-500/10 text-amber-700 ring-amber-500/20 dark:text-amber-400'
				: status === 'inactive'
					? 'bg-slate-100 text-slate-500 ring-slate-200 dark:bg-slate-500/10 dark:text-slate-400 dark:ring-slate-500/20'
					: 'bg-primary/10 text-primary ring-primary/15'; // lead / new — brand green
	}
</script>

<div class="overflow-hidden rounded-xl border border-border/70 bg-card shadow-card">
	<div class="overflow-x-auto">
		<table class="w-full min-w-[640px] text-sm">
			<thead>
				<tr class="border-b border-border/60 bg-muted/30">
					{#if selectable}
						<th class="w-11 px-4 py-3">
							<!-- Select-all checkbox -->
							<button
								type="button"
								onclick={onToggleAll}
								class={cn(
									'mx-auto flex h-[18px] w-[18px] items-center justify-center rounded border-2 transition-colors',
									allSelected
										? 'border-primary bg-primary text-primary-foreground'
										: 'border-border bg-background hover:border-primary/60'
								)}
							>
								{#if allSelected}<Check class="h-2.5 w-2.5" />{/if}
							</button>
						</th>
					{/if}
					<th class="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Contact</th>
					<th class="hidden px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground xl:table-cell">Email</th>
					<th class="hidden px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground lg:table-cell">Phone</th>
					<th class="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
					<th class="hidden px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground xl:table-cell">Assignee</th>
					<th class="hidden px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground 2xl:table-cell">Tags</th>
					<th class="w-12 px-4 py-3"></th>
				</tr>
			</thead>
			<tbody class="divide-y divide-border/30">
				{#each items as row (row.id)}
					{@const isSelected = selected?.has(row.id) ?? false}
					<tr
						class={cn(
							'group transition-colors',
							selectable ? 'cursor-pointer select-none hover:bg-muted/40' : 'hover:bg-muted/20',
							isSelected && 'bg-primary/5 hover:bg-primary/[0.08]',
							row.status === 'archived' && 'opacity-60'
						)}
						onclick={selectable ? () => onToggleSelect?.(row.id) : undefined}
					>
						{#if selectable}
							<td class="w-11 px-4 py-4">
								<div class={cn(
									'mx-auto flex h-[18px] w-[18px] items-center justify-center rounded border-2 transition-colors',
									isSelected
										? 'border-primary bg-primary text-primary-foreground'
										: 'border-border bg-background group-hover:border-primary/60'
								)}>
									{#if isSelected}<Check class="h-2.5 w-2.5" />{/if}
								</div>
							</td>
						{/if}

						<!-- Contact cell: status-colored avatar + name link -->
						<td class="px-4 py-3.5">
							<div class="flex items-center gap-3">
								<div class={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold ring-1', avatarRingClass(row.status))}>
									{row.initials}
								</div>
								<div class="min-w-0">
									{#if selectable}
										<p class="truncate font-medium leading-snug text-foreground">{row.name}</p>
									{:else}
										<a
											href="/entity/{row.id}"
											onclick={(e) => e.stopPropagation()}
											class="block truncate font-medium leading-snug text-foreground transition-colors hover:text-primary focus-visible:text-primary focus-visible:outline-none"
										>
											{row.name}
										</a>
									{/if}
								</div>
							</div>
						</td>

						<!-- Email — xl+ only -->
						<td class="hidden px-4 py-3.5 xl:table-cell">
							<span class="block max-w-[200px] truncate text-muted-foreground">{row.email ?? '—'}</span>
						</td>

						<!-- Phone — lg+ only -->
						<td class="hidden px-4 py-3.5 lg:table-cell">
							<span class="whitespace-nowrap text-muted-foreground">{row.phone ?? '—'}</span>
						</td>

						<!-- Status badge — always visible -->
						<td class="px-4 py-3.5">
							<Badge variant={row.statusVariant} label={row.statusLabel} />
						</td>

						<!-- Assignee — xl+ only -->
						<td class="hidden px-4 py-3.5 xl:table-cell">
							{#if row.assignee}
								<span class="text-muted-foreground">{row.assignee}</span>
							{:else}
								<span class="italic text-muted-foreground/40">Unassigned</span>
							{/if}
						</td>

						<!-- Tags — 2xl+ only -->
						<td class="hidden px-4 py-3.5 2xl:table-cell">
							<!-- render tag chips here -->
						</td>

						<!-- Actions: revealed on row hover, hidden in select mode -->
						<td class="w-12 px-2 py-3.5" onclick={(e) => e.stopPropagation()}>
							{#if !selectable}
								<DropdownMenu.Root>
									<DropdownMenu.Trigger
										class={cn(
											'inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-all hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
											'opacity-0 group-hover:opacity-100 focus-visible:opacity-100'
										)}
									>
										<MoreHorizontal class="h-4 w-4" />
									</DropdownMenu.Trigger>
									<DropdownMenu.Content align="end">
										<DropdownMenu.Item onclick={() => goto(`/entity/${row.id}`)}>View</DropdownMenu.Item>
										<DropdownMenu.Item onclick={() => goto(`/entity/${row.id}/edit`)}>Edit</DropdownMenu.Item>
									</DropdownMenu.Content>
								</DropdownMenu.Root>
							{/if}
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
</div>
```

---

## Responsive List Page Layout

**Every list page (contacts, jobs, invoices, quotes, appointments) uses this exact dual-render pattern.**
Desktop gets the data table. Mobile gets cards. Never show a table on mobile; never show cards-only on desktop.

```svelte
<!-- +page.svelte — content area after filters -->

<!-- Desktop: data table — lg and above -->
<div class="hidden lg:block">
	<ContactTable
		{items}
		selectable={selectionMode}
		{selected}
		onToggleSelect={toggleSelect}
		onToggleAll={toggleSelectAll}
		allSelected={allLoadedSelected}
	/>
</div>

<!-- Mobile: card list — below lg -->
<div class="lg:hidden">
	{#if selectionMode}
		<div class="mb-3 flex items-center justify-between px-1">
			<button type="button" class="text-sm font-medium text-primary" onclick={toggleSelectAll}>
				{allLoadedSelected ? 'Clear all' : 'Select all'}
			</button>
			<span class="text-xs text-muted-foreground">{selected.size} selected</span>
		</div>
	{/if}
	<ul class="grid gap-3" class:pb-24={selectionMode && selected.size > 0}>
		{#each items as c (c.id)}
			<li>
				<EntityListCard ... selectable={selectionMode} selected={selected.has(c.id)} />
			</li>
		{/each}
	</ul>
</div>

{#if nextCursor}
	<div class="flex justify-center pt-2">
		<Button variant="outline" disabled={loadingMore} onclick={loadMore}>
			{loadingMore ? 'Loading…' : 'Load more'}
		</Button>
	</div>
{/if}
```

**Never**: show a `<table>` on mobile. Never: show only cards on desktop. Never: use `md:` for this split.

---

## Filter Toolbar Pattern

All list pages use this two-layer toolbar structure. The key principle: **tabs + search share a single row on desktop; they stack on mobile.**

```svelte
<!-- Filter toolbar — goes between PageWrapper header and the list/table -->
<div class="space-y-3 lg:space-y-4">

	<!-- Row 1: Status tabs (left) + Search (right on desktop, full-width on mobile) -->
	<div class="flex flex-col gap-3 lg:flex-row lg:items-center lg:gap-4">
		<!-- Status tabs: scroll on mobile if needed, static on desktop -->
		<div class="shrink-0">
			<StatusFilterTabs bind:value={statusFilter} />
		</div>
		<!-- Search: full-width on mobile, fixed 288px pushed to right on desktop -->
		<div class="lg:ml-auto lg:w-72">
			<SearchBar bind:value={searchInput} onInput={(v) => (q = v)} />
		</div>
	</div>

	<!-- Row 2: Scope filter (only if user has canViewAll permission) -->
	{#if canViewAll}
		<ScopeFilter bind:value={scope} />
	{/if}

	<!-- Row 3: Tag pills (horizontal scrollable chips) -->
	<TagsFilter bind:value={tag} />

</div>
```

### Status filter tab sizing
- Mobile: tabs use natural width, the row scrolls if it overflows (`overflow-x-auto`)
- Desktop: tabs sit left-aligned at natural width — do NOT stretch to full width with `flex-1`
- 4 options (All / Leads / Customers / Archived) is the sweet spot for pill tabs; anything beyond 5 should become a dropdown

### PageWrapper actions slot (top-right header)
The Select and New buttons live in `{#snippet actions()}` inside `PageWrapper`, not in the filter toolbar:

```svelte
{#snippet actions()}
	{#if selectionMode}
		<Button variant="outline" onclick={exitSelect}>Done</Button>
	{:else}
		{#if canBulk}
			<Button variant="outline" onclick={enterSelect}>
				<CheckSquare class="h-4 w-4" /> Select
			</Button>
		{/if}
		{#if canCreate}
			<Button href="/entity/new"><Plus class="h-4 w-4" /> New</Button>
		{/if}
	{/if}
{/snippet}
```

---

## Command Palette (Cmd+K)

Add a global command palette using shadcn-svelte's `Command` component.
This is the biggest single UX upgrade for power users.

```svelte
<!-- src/lib/components/shared/CommandPalette.svelte -->
<script lang="ts">
	import * as Command from '$lib/components/ui/command';
	import * as Dialog from '$lib/components/ui/dialog';
	import { goto } from '$app/navigation';

	let open = $state(false);

	// Keyboard shortcut
	$effect(() => {
		function handleKeydown(e: KeyboardEvent) {
			if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
				e.preventDefault();
				open = !open;
			}
		}
		document.addEventListener('keydown', handleKeydown);
		return () => document.removeEventListener('keydown', handleKeydown);
	});

	function navigate(href: string) {
		open = false;
		goto(href);
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="p-0 shadow-modal border-border/50 sm:max-w-[550px] overflow-hidden">
		<Command.Root class="rounded-lg bg-card">
			<Command.Input placeholder="Search or jump to..." class="border-0 ring-0 text-base h-14" />
			<Command.List class="max-h-[400px]">
				<Command.Empty class="py-8 text-center text-sm text-muted-foreground">
					No results found.
				</Command.Empty>

				<Command.Group heading="Navigate">
					<Command.Item onselect={() => navigate('/dashboard')}>
						<LayoutDashboard class="mr-2 h-4 w-4" />
						Dashboard
					</Command.Item>
					<Command.Item onselect={() => navigate('/contacts')}>
						<Users class="mr-2 h-4 w-4" />
						Contacts
					</Command.Item>
					<Command.Item onselect={() => navigate('/jobs')}>
						<Briefcase class="mr-2 h-4 w-4" />
						Jobs
					</Command.Item>
				</Command.Group>

				<Command.Separator />

				<Command.Group heading="Create">
					<Command.Item onselect={() => navigate('/contacts/new')}>
						<Plus class="mr-2 h-4 w-4" />
						New Contact
					</Command.Item>
					<Command.Item onselect={() => navigate('/jobs/new')}>
						<Plus class="mr-2 h-4 w-4" />
						New Job
					</Command.Item>
				</Command.Group>
			</Command.List>
		</Command.Root>
	</Dialog.Content>
</Dialog.Root>
```

Mount in `(app)/+layout.svelte`:

```svelte
<CommandPalette />
```

Trigger button in header (desktop):

```svelte
<button
	onclick={() => (commandOpen = true)}
	class="
    hidden md:flex items-center gap-2
    rounded-md border border-border/50 bg-muted
    px-3 py-1.5 text-sm text-muted-foreground
    transition-colors hover:bg-accent hover:text-foreground
  "
>
	<Search class="h-3.5 w-3.5" />
	Search...
	<kbd class="ml-4 rounded border border-border px-1.5 py-0.5 text-[10px] font-mono bg-background">
		⌘K
	</kbd>
</button>
```

---

## Infinite Scroll / Load More

```svelte
<!-- At the bottom of a list page -->
{#if nextCursor}
	<div class="flex justify-center pt-4 pb-2">
		<Button
			variant="outline"
			size="sm"
			onclick={loadMore}
			disabled={loading}
			class="border-border/50 text-muted-foreground hover:text-foreground"
		>
			{#if loading}
				<svg class="mr-2 h-3.5 w-3.5 animate-spin" ...></svg>
				Loading...
			{:else}
				Load more
			{/if}
		</Button>
	</div>
{/if}
```

---

## Section Dividers with Labels

```svelte
<!-- Labelled section divider -->
<div class="flex items-center gap-3 my-4">
	<div class="h-px flex-1 bg-border/50"></div>
	<span class="text-xs font-medium uppercase tracking-wider text-muted-foreground px-2">
		Today
	</span>
	<div class="h-px flex-1 bg-border/50"></div>
</div>
```

---

## Safe Area (iOS notch / home bar)

```svelte
<!-- Bottom nav — handle iPhone home indicator -->
<nav class="
  fixed bottom-0 inset-x-0
  pb-[env(safe-area-inset-bottom)]
  ...
">

<!-- Page content — avoid overlap with bottom nav -->
<div class="pb-[calc(var(--bottom-nav-height)+env(safe-area-inset-bottom))]">
```

Ensure `app.css` has:

```css
:root {
	--bottom-nav-height: 64px;
}
```
