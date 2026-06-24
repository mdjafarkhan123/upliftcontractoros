# Typography & Motion — Contractor Growth OS

> Read this for font setup, text hierarchy, and all animation/transition patterns.

---

## Font Setup — Anthropic Sans (Primary)

**Primary font:** Anthropic Sans — self-hosted from `/static/fonts/` via `@font-face` in `app.css`.  
**Fallback:** Geist, then Inter, then system-ui.  
No Google Fonts import. No npm package. No `font-display: block`.

```css
/* app.css — already configured, do NOT duplicate */
@font-face {
  font-family: 'Anthropic Sans';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url('/fonts/anthropicsans-text-regular-static-webfont.woff2') format('woff2');
}
@font-face {
  font-family: 'Anthropic Sans';
  font-style: normal;
  font-weight: 500;
  font-display: swap;
  src: url('/fonts/anthropicsans-text-medium-static-webfont.woff2') format('woff2');
}
@font-face {
  font-family: 'Anthropic Sans';
  font-style: normal;
  font-weight: 600;
  font-display: swap;
  src: url('/fonts/anthropicsans-text-semibold-static-webfont.woff2') format('woff2');
}
@font-face {
  font-family: 'Anthropic Sans';
  font-style: normal;
  font-weight: 700;
  font-display: swap;
  src: url('/fonts/anthropicsans-text-bold-static-webfont.woff2') format('woff2');
}
```

Applied at the `html` level in `app.css`:

```css
html {
  font-family: 'Geist', 'Inter', system-ui, sans-serif;
}
```

Note: `html` declaration uses Geist as a fallback chain. Anthropic Sans is self-hosted and available at font weights 400/500/600/700 — use those weights only.

**Why NOT in Tailwind config:** The `fontFamily.sans` extension can conflict with how browsers resolve the weight range from `@font-face`. The `html` declaration takes precedence — leave `tailwind.config.ts` fontFamily as `[...fontFamily.sans]`.

---

## Typography Rules

- **`tracking-tight`** on headings (`text-xl` and above) — tighter letter spacing looks more premium
- **`tracking-wider` + `uppercase`** on table headers and stat labels — clear visual distinction from body
- **`font-mono`** on IDs, quote/invoice numbers, currency amounts — improves scannability of numbers
- **Never `font-bold` on body text** — use `font-medium` (500) for emphasis, `font-semibold` (600) for headings only
- **Light mode body weight** — `font-normal` body text can feel too thin on white. Use `font-medium` for list item names, table cell primary values, and text that needs to hold its own against a white surface
- **`text-muted-foreground`** for anything secondary: dates, counts, helper text, field labels
- **`tabular-nums`** on any numeric data that may change or sit in a column — prevents layout shift

### Type Scale Reference

```
text-2xl font-semibold tracking-tight   → Page title (PageWrapper h1 on desktop)
text-xl  font-semibold tracking-tight   → Page title (mobile)
text-base font-semibold                 → Section headings, card titles
text-sm  font-semibold                  → Sub-section labels, list item names
text-sm  font-medium                    → Body text, input values
text-sm  text-muted-foreground          → Secondary body text
text-xs  font-medium uppercase tracking-wider text-muted-foreground → Table headers, KPI labels
text-xs  text-muted-foreground          → Meta info, timestamps, counts
```

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
<!-- List row hover (contacts, jobs, invoices, quotes) -->
<a class="
  group flex items-center gap-3 rounded-xl border border-border/60 bg-card px-4 py-3
  shadow-card transition-all duration-150 ease-out
  hover:border-primary/30 hover:bg-card-raised hover:shadow-dropdown
  active:bg-muted/70
  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring
  dark:border-white/10
">

<!-- Card hover lift (stat cards, dashboard cards) -->
<div class="
  rounded-xl border border-border/60 bg-card shadow-card
  transition-all duration-200 ease-out
  hover:-translate-y-0.5 hover:shadow-dropdown
  cursor-pointer
">

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

<!-- Back button hover (PageWrapper style) -->
<button class="
  inline-flex h-10 w-10 items-center justify-center rounded-full
  border border-border/70 bg-card text-foreground shadow-card
  transition-all duration-150 ease-out
  hover:-translate-x-0.5 hover:border-primary/30 hover:bg-card-raised
  focus-visible:ring-2 focus-visible:ring-ring
">
```

### Table Row Hover — Action Reveal

Table action menus are hidden by default and revealed on hover. This is the only `opacity-0` pattern in the codebase — used exclusively for the `⋮` button on table rows.

```svelte
<!-- <tr> must have class="group" -->
<tr class="group transition-colors hover:bg-muted/40">

  <!-- ⋮ button: invisible at rest, visible on row hover or keyboard focus -->
  <DropdownMenu.Trigger class="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-all ...">
    <MoreHorizontal class="h-4 w-4" />
  </DropdownMenu.Trigger>
```

Do NOT apply `opacity-0 group-hover:opacity-100` to anything other than the table action button. Cards use direct hover state changes instead.

---

### Entry Animations (page / drawer / modal)

```svelte
<!-- Dialog scale in — shadcn Dialog handles this -->
<!-- Enhance by adding to Dialog.Content: -->
<Dialog.Content class="
  animate-in fade-in-0 zoom-in-95
  data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95
  duration-200
">

<!-- Bottom sheet / drawer slide up -->
<!-- shadcn Sheet handles this automatically with side="bottom" -->

<!-- List items stagger (empty → populated, optional) -->
{#each items as item, i (item.id)}
  <div
    class="animate-in fade-in-0 slide-in-from-bottom-2"
    style="animation-delay: {i * 30}ms; animation-duration: 200ms; animation-fill-mode: both"
  >
    <!-- item content -->
  </div>
{/each}
```

---

### Loading States — Shimmer Skeleton

The `.skeleton-shimmer` class in `app.css` has separate light and dark implementations.  
**Light mode**: soft gray-on-white sweep via `html:not(.dark)` selector.  
**Dark mode**: mid-gray sweep on the deep navy surface.  
The split is automatic — no manual dark mode class needed.

Always use the `SkeletonLoader` component, not the raw class directly.

```svelte
<!-- Match skeleton structure to real content shape -->
<SkeletonLoader lines={3} />                      <!-- 3 text lines -->
<SkeletonLoader lines={5} height="84px" />         <!-- 5 card-height rows -->
<SkeletonLoader lines={4} height="1rem" gap="0.5rem" />
```

Always use `SkeletonLoader` for loading states — never a static gray block or a spinner alone for page content. Match the skeleton to the real content structure (same number of lines, similar heights).

---

### JetEngineButton Animations (from app.css)

```
.animate-spool-up   → Loader2 icon: spins from 0° to 900° in 1.4s (spool up),
                       then continues at constant speed. Used on JetEngineButton loading state.

.animate-pop-in     → Check icon: scales from 0 to 1.25× then settles to 1×,
                       with opacity fade in. Used on JetEngineButton success state.
```

These are applied automatically by `JetEngineButton`. Do not apply them manually elsewhere.

---

## Number & Currency Display

```svelte
<!-- Large monetary amount — stat card / KPI -->
<p class="text-2xl font-bold tracking-tight text-foreground tabular-nums">
  {formatCurrency(revenue)}
</p>
<p class="mt-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
  Revenue this month
</p>

<!-- Inline amount — table cell / list item -->
<span class="font-mono text-sm font-semibold tabular-nums text-foreground">
  {formatCurrency(amount)}
</span>

<!-- Positive delta (trending up) -->
<span class="flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
  <TrendingUp class="h-3 w-3" />
  +12.5%
</span>

<!-- Negative delta -->
<span class="flex items-center gap-1 text-xs font-medium text-red-500 dark:text-red-400">
  <TrendingDown class="h-3 w-3" />
  -3.2%
</span>

<!-- Quote/invoice number — always monospace -->
<span class="font-mono text-sm font-semibold text-foreground">Q-0042</span>
```

`formatCurrency` is from `$lib/utils/format`. Always use it for monetary values — never format manually.
