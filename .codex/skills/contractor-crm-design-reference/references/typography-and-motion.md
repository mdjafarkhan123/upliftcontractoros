# Typography & Motion — Contractor Growth OS

> This reference was copied from the old Claude skill and may include Tailwind/shadcn examples.
> For this repo, translate examples into SCSS and shared CSS custom properties.
>
> Read this for font setup, text hierarchy, and all animation/transition patterns.

---

## Font Setup — Geist Sans

**Why Geist**: Sharp, geometric, optimised for UI. Used by Vercel. Reads clearly at small sizes on dark backgrounds — perfect for information-dense SaaS.

### Installation

Option A — Google Fonts (already in `app.css`):
```css
@import url('https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600;700&display=swap');
```

Option B — Self-hosted (preferred for production — no FOUT, no external request):
```bash
npm install geist
```
```css
/* app.css */
@import 'geist/font/sans';
```
```typescript
// tailwind.config.ts
fontFamily: {
  sans: ['Geist Sans', 'Inter', 'system-ui', 'sans-serif'],
}
```

---

## Typography Scale

Apply these patterns consistently. Never use arbitrary font sizes — always use Tailwind's scale.

```svelte
<!-- Page title (h1) — major section header -->
<h1 class="text-2xl font-semibold tracking-tight text-foreground">
  Contacts
</h1>

<!-- Page subtitle / description -->
<p class="text-sm text-muted-foreground">
  Manage your leads and customers
</p>

<!-- Section header (h2) — within a page -->
<h2 class="text-base font-semibold text-foreground">
  Recent Activity
</h2>

<!-- Card title -->
<p class="text-sm font-medium text-foreground">
  Job #1042 — Roof Replacement
</p>

<!-- Card body / list value -->
<p class="text-sm text-foreground">
  Jane Smith
</p>

<!-- Label / helper text -->
<p class="text-xs text-muted-foreground">
  Last updated 2 hours ago
</p>

<!-- Stat / metric — large number display -->
<p class="text-3xl font-bold tracking-tight text-foreground">
  $24,500
</p>
<p class="text-xs font-medium text-muted-foreground uppercase tracking-wider">
  Revenue this month
</p>

<!-- Sidebar section label — group headers in the nav rail -->
<p class="px-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">
  Main Menu
</p>

<!-- Table header -->
<th class="text-xs font-medium text-muted-foreground uppercase tracking-wider">
  Status
</th>

<!-- Code / monospace (invoice numbers, IDs) -->
<span class="font-mono text-sm text-foreground">
  INV-2024-0042
</span>
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
<Card.Root class="
  transition-all duration-200 ease-out
  hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/20
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

The `skeleton-shimmer` class is defined in `app.css`. Use it in `SkeletonLoader.svelte`:

```svelte
<!-- src/lib/components/shared/SkeletonLoader.svelte -->
<script lang="ts">
  let { lines = 3, height = '1rem', gap = '0.75rem' } = $props<{
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

```svelte
<!-- Contact avatar with initials fallback -->
<div class="
  flex h-9 w-9 shrink-0 items-center justify-center
  rounded-full bg-primary/10 text-primary
  text-sm font-semibold
">
  {contact.full_name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
</div>

<!-- With image (when photo_url exists) -->
{#if contact.photo_url}
  <img
    src={contact.photo_url}
    alt={contact.full_name}
    class="h-9 w-9 rounded-full object-cover"
  />
{:else}
  <div class="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary text-sm font-semibold">
    {contact.full_name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
  </div>
{/if}
```
