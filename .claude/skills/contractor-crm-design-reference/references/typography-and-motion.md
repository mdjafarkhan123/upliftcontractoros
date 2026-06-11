# Typography & Motion — Contractor Growth OS

> Read this for font setup, text hierarchy, and all animation/transition patterns.

---

## Font Setup — Geist Sans

**Why Geist**: Sharp, geometric, optimised for UI. Used by Vercel. Reads clearly at small sizes on both light and dark backgrounds — perfect for information-dense SaaS.

### How it's loaded in this project

Geist is **self-hosted** from `/static/fonts/` via `@font-face` declarations in `app.css`.
No Google Fonts import. No `npm install geist`. No `font-display: block`.

```css
/* app.css — already configured, do NOT duplicate */
@font-face {
	font-family: 'Geist';
	font-style: normal;
	font-weight: 300 400;
	font-display: swap;
	src: url('/fonts/geist-v5-latin-regular.woff2') format('woff2');
}
@font-face {
	font-family: 'Geist';
	font-style: normal;
	font-weight: 500;
	font-display: swap;
	src: url('/fonts/geist-v5-latin-500.woff2') format('woff2');
}
@font-face {
	font-family: 'Geist';
	font-style: normal;
	font-weight: 600 700;
	font-display: swap;
	src: url('/fonts/geist-v5-latin-600.woff2') format('woff2');
}
```

Applied at the `html` level in `app.css` — NOT in `tailwind.config.ts`:

```css
html {
	font-family: 'Geist', 'Inter', system-ui, sans-serif;
}
```

**Why NOT in Tailwind config**: The `font-bold` (700) weight uses the 600 face via the declared weight range. If Tailwind overrides `fontFamily.sans`, it can conflict with how the browser resolves the weight range. Leave `tailwind.config.ts` fontFamily as `[...fontFamily.sans]` — the `html` declaration takes precedence anyway.

---

## Typography Scale

Apply these patterns consistently. Never use arbitrary font sizes — always use Tailwind's scale.

```svelte
<!-- Page title (h1) — major section header -->
<h1 class="text-2xl font-semibold tracking-tight text-foreground">Contacts</h1>

<!-- Page subtitle / description -->
<p class="text-sm text-muted-foreground">Manage your leads and customers</p>

<!-- Section header (h2) — within a page -->
<h2 class="text-base font-semibold text-foreground">Recent Activity</h2>

<!-- Card title -->
<p class="text-sm font-medium text-foreground">Job #1042 — Roof Replacement</p>

<!-- Card body / list value -->
<p class="text-sm text-foreground">Jane Smith</p>

<!-- Label / helper text -->
<p class="text-xs text-muted-foreground">Last updated 2 hours ago</p>

<!-- Stat / metric — compact KPI card (inside a card component) -->
<p class="text-2xl font-bold tracking-tight text-foreground">$24,500</p>
<p class="text-xs font-medium text-muted-foreground uppercase tracking-wider">Revenue this month</p>

<!-- Stat / metric — dashboard hero (large featured number, more whitespace available) -->
<p class="text-3xl font-bold tracking-tight text-foreground">$24,500</p>
<p class="mt-1 text-xs font-medium text-muted-foreground uppercase tracking-wider">Revenue this month</p>

<!-- Rule: text-2xl inside cards (space is constrained). text-3xl only for large featured stats
     with generous padding. Never mix these sizes on the same page for the same type of stat. -->

<!-- Sidebar section label — group headers in the nav rail -->
<p class="px-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">
	Main Menu
</p>

<!-- Table header -->
<th class="text-xs font-medium text-muted-foreground uppercase tracking-wider"> Status </th>

<!-- Code / monospace (invoice numbers, IDs) -->
<span class="font-mono text-sm text-foreground"> INV-2024-0042 </span>
```

### Typography Rules

- **`tracking-tight`** on headings (`text-xl` and above) — tighter letter spacing looks more premium
- **`tracking-wider` + `uppercase`** on table headers and stat labels — clear visual distinction from body
- **`font-mono`** on IDs, invoice numbers, amounts — improves scannability
- **Never bold body text** — use `font-medium` for emphasis, `font-semibold` for headings only
- **Light mode needs slightly heavier weights** — on white backgrounds, `font-normal` body text
  can feel too thin. Use `font-medium` (500) for list item names, table cell primary values,
  and any text that needs to hold its own against a white surface.
- **`text-muted-foreground`** for anything secondary: dates, counts, helper text, labels

---

## Motion System

### The Golden Rule

Every interactive element needs a transition. No exceptions.

```css
/* Baseline — apply to ALL clickable/hoverable elements */
transition-all duration-150 ease-out

/* State changes (color, bg, border) */
transition-colors duration-150 ease-out

/* Size/transform changes (hover lift, scale) */
transition-transform duration-150 ease-out
```

### Hover Patterns

```svelte
<!-- List row hover (contacts, jobs, invoices) -->
<!-- In light mode: hover:bg-muted/60 gives a very subtle gray tint on white -->
<!-- In dark mode: hover:bg-accent/50 gives the equivalent subtle highlight -->
<div class="
  cursor-pointer
  rounded-lg px-4 py-3
  transition-colors duration-150 ease-out
  hover:bg-muted/60
  active:bg-muted
">

<!-- Card hover lift (dashboard stat cards) -->
<!-- Use shadow-dropdown, NOT shadow-lg — semantic tokens adapt between light/dark mode -->
<Card.Root class="
  transition-all duration-200 ease-out
  hover:-translate-y-0.5 hover:shadow-dropdown
  cursor-pointer
">

<!-- Button press feedback (all buttons get this via shadcn) -->
<Button class="active:scale-95 transition-transform duration-100">

<!-- Nav item hover -->
<a class="
  flex items-center gap-3 rounded-md px-3 py-2
  text-muted-foreground
  transition-colors duration-150
  hover:bg-accent hover:text-foreground
  [&.active]:bg-primary/10 [&.active]:text-primary
">

<!-- Icon button hover -->
<button class="
  rounded-md p-2
  text-muted-foreground
  transition-colors duration-150
  hover:bg-accent hover:text-foreground
  focus-visible:ring-2 focus-visible:ring-ring
">
```

### Table Row Hover — Action Reveal

Table action menus are hidden by default and revealed on hover. This is the only `opacity-0` pattern in the codebase — used exclusively for the `⋮` button on table rows.

```svelte
<!-- <tr> must have class="group" -->
<tr class="group transition-colors hover:bg-muted/20">

	<!-- ⋮ button: invisible at rest, visible on row hover or keyboard focus -->
	<DropdownMenu.Trigger class="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-all ...">
		<MoreHorizontal class="h-4 w-4" />
	</DropdownMenu.Trigger>
```

Do NOT apply `opacity-0 group-hover:opacity-100` to anything other than the table action button. Cards use direct hover state changes instead.

---

### Entry Animations (page / drawer / modal)

```svelte
<!-- Bottom sheet / drawer slide up -->
<!-- shadcn Sheet handles this — ensure side="bottom" is set -->

<!-- Dialog scale in — shadcn Dialog handles this -->
<!-- Enhance by adding to Dialog.Content: -->
<Dialog.Content class="
  animate-in fade-in-0 zoom-in-95
  data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95
  duration-200
">

<!-- List items stagger (optional, for empty→populated) -->
{#each items as item, i (item.id)}
  <div
    class="animate-in fade-in-0 slide-in-from-bottom-2"
    style="animation-delay: {i * 30}ms; animation-duration: 200ms; animation-fill-mode: both"
  >
    <!-- item content -->
  </div>
{/each}
```

### Loading States — Shimmer Skeleton

The `skeleton-shimmer` class is defined in `app.css` with separate light and dark implementations.
**Light mode**: soft gray-on-white sweep. **Dark mode**: mid-gray sweep on the deep navy surface.
The `html:not(.dark)` selector handles the split automatically — no manual dark mode class needed.

```svelte
<!-- src/lib/components/shared/SkeletonLoader.svelte -->
<script lang="ts">
	let {
		lines = 3,
		height = '1rem',
		gap = '0.75rem'
	} = $props<{
		lines?: number;
		height?: string;
		gap?: string;
	}>();
</script>

<div class="flex flex-col" style="gap: {gap}">
	{#each Array(lines) as _, i}
		<div
			class="skeleton-shimmer rounded-md"
			style="height: {height}; width: {i === lines - 1 ? '60%' : '100%'}"
		/>
	{/each}
</div>
```

Always use `SkeletonLoader` for loading states — never a static gray block or a spinner alone. Match the skeleton structure to the real content that will appear (same number of lines, similar heights).

### Spinner (inline loading indicator)

```svelte
<!-- Use for button loading states -->
<svg
	class="h-4 w-4 animate-spin text-current"
	xmlns="http://www.w3.org/2000/svg"
	fill="none"
	viewBox="0 0 24 24"
>
	<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
	<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
</svg>
```

---

## Number & Currency Display

```svelte
<!-- Large monetary amount — stat card -->
<div>
	<p class="text-3xl font-bold tracking-tight text-foreground">
		{formatCurrency(revenue)}
	</p>
	<p class="mt-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
		Revenue this month
	</p>
</div>

<!-- Inline amount — table cell / list item -->
<span class="font-mono text-sm font-medium text-foreground">
	{formatCurrency(amount)}
</span>

<!-- Positive delta (trending up) -->
<span class="flex items-center gap-1 text-xs font-medium text-green-400">
	<TrendingUp class="h-3 w-3" />
	+12.5%
</span>

<!-- Negative delta -->
<span class="flex items-center gap-1 text-xs font-medium text-red-400">
	<TrendingDown class="h-3 w-3" />
	-3.2%
</span>
```

---

## Avatar / Initials Pattern

Avatars use **status-coded ring colors** — never a single color for all records.
See `component-aesthetics.md → Avatar Ring System` for the full color table.

```svelte
<!-- Status-colored avatar — used in both mobile cards and desktop table rows -->
{@const initials = contact.full_name.split(/\s+/).map(p => p[0]?.toUpperCase() ?? '').slice(0, 2).join('')}

<div class={cn(
	'flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold ring-1',
	contact.status === 'customer' || contact.status === 'active'
		? 'bg-emerald-500/10 text-emerald-700 ring-emerald-500/20 dark:text-emerald-400'
		: contact.status === 'archived'
			? 'bg-amber-500/10 text-amber-700 ring-amber-500/20 dark:text-amber-400'
			: contact.status === 'inactive'
				? 'bg-slate-100 text-slate-500 ring-slate-200 dark:bg-slate-500/10 dark:text-slate-400 dark:ring-slate-500/20'
				: 'bg-primary/10 text-primary ring-primary/15' // lead / new — brand green
)}>
	{initials || '?'}
</div>

<!-- With image (when photo_url exists) -->
{#if contact.photo_url}
	<img src={contact.photo_url} alt={contact.full_name} class="h-9 w-9 rounded-full object-cover ring-1 ring-border" />
{:else}
	<!-- status-colored div above -->
{/if}
```

**Size variants**: `h-9 w-9` for table rows and detail pages, `h-11 w-11` for mobile list cards (larger touch target area).
