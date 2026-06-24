# Color System — Contractor Growth OS

> Source of truth: `src/lib/styles/app.css` defines all CSS variables.  
> Tailwind config (`tailwind.config.ts`) maps them to utility classes.  
> **Never use raw hex values in components.** Always use the semantic Tailwind classes below.  
> Exception: Tailwind named color utilities (`bg-green-50`, `bg-amber-500/10`, etc.) are allowed for  
> status badge trifectas (bg + text + border) where semantic tokens don't have a named variant.  
> Light mode is `:root`. Dark mode is `.dark` class on `<html>`.

---

## Surface & Background Tokens

| CSS Variable      | Tailwind Class    | Light Value         | Dark Value           | When to use                              |
|-------------------|-------------------|---------------------|----------------------|------------------------------------------|
| `--background`    | `bg-background`   | white `#ffffff`     | deep navy `#080C14`  | Page body, main content area             |
| `--sidebar`       | `bg-sidebar`      | gray-50 `#f3f4f8`   | slightly lighter navy| Left navigation sidebar ONLY             |
| `--card`          | `bg-card`         | white `#ffffff`     | navy `hsl(220 22% 11%)` | Card surfaces, panels                 |
| `--card-raised`   | `bg-card-raised`  | off-white `#fafafa` | lighter navy         | Nested surfaces inside cards, pill groups |
| `--popover`       | `bg-popover`      | white               | same as card         | Dropdowns, tooltips, command palette     |
| `--muted`         | `bg-muted`        | gray-50             | dark muted           | Skeleton bg, secondary surfaces, kbd     |
| `--accent`        | `bg-accent`       | gray-100            | dark green tint      | Hover state on nav items, rows           |
| `--secondary`     | `bg-secondary`    | gray-100            | dark muted           | Secondary button fill (same as muted)    |

**Rule:** Never put `bg-card` inside another `bg-card`. Use `bg-muted` or `bg-card-raised` for nested surfaces.  
**Rule:** Sidebar is ALWAYS `bg-sidebar` — never `bg-background` or `bg-card`.

---

## Text Tokens

| CSS Variable          | Tailwind Class          | When to use                                          |
|-----------------------|-------------------------|------------------------------------------------------|
| `--foreground`        | `text-foreground`       | Primary text — names, headings, data values          |
| `--card-foreground`   | `text-card-foreground`  | Same as foreground, inside cards (usually identical) |
| `--muted-foreground`  | `text-muted-foreground` | Secondary text — dates, counts, labels, helper text  |
| `--primary`           | `text-primary`          | Brand green — active nav, links, highlighted values  |
| `--destructive`       | `text-destructive`      | Error text, delete confirmations                     |
| `--accent-foreground` | `text-accent-foreground`| Text on hover accent backgrounds                     |

---

## Primary Brand (Green)

| CSS Variable      | Tailwind Class    | Light HSL           | Dark HSL             | When to use                        |
|-------------------|-------------------|---------------------|----------------------|------------------------------------|
| `--primary`       | `bg-primary`      | `151 70% 35%`       | `151 62% 43%`        | Primary buttons, active states     |
| `--primary`       | `text-primary`    | same                | same                 | Active nav, links, icons           |
| `--primary`       | `border-primary`  | same                | same                 | Focus rings, selected borders      |
| `--ring`          | `ring-primary/20` | `151 62% 40%`       | `151 62% 46%`        | Focus ring color (via ring-ring)   |

### Brand Palette (use sparingly — gradients, accents, special animations)

```css
--brand-deep:    hsl(150 57% 17%)   /* #13452d — deep forest green */
--brand-primary: hsl(150 57% 31%)   /* #227d53 — mid green */
--brand-light:   hsl(114 100% 48%)  /* #17f700 — neon green (snake glow animation only) */
```

The `--brand-light` neon green is used exclusively in the `.snake-glow` hover effect on special CTA elements. Do not use it for text or backgrounds.

---

## Border & Input Tokens

| CSS Variable | Tailwind Class     | Light Value          | Dark Value           | When to use                     |
|--------------|--------------------|----------------------|----------------------|---------------------------------|
| `--border`   | `border-border`    | `hsl(220 13% 91%)`   | `hsl(220 14% 30%)`   | Full-opacity dividers, active   |
|              | `border-border/60` | 60% opacity          | 60% opacity          | Default card borders (preferred)|
|              | `border-border/40` | 40% opacity          | 40% opacity          | Subtle dividers inside cards    |
| `--input`    | `border-input`     | same as border       | same as border       | Input field borders (shadcn)    |
| `--ring`     | `ring-ring`        | green                | green                | Focus rings via focus-visible   |

**Rule:** Use `border-border/60` as the default card border. Only escalate to full `border-border` on active/focus states.

---

## Destructive / Danger

| Tailwind Class            | When to use                                    |
|---------------------------|------------------------------------------------|
| `bg-destructive`          | Danger button background                       |
| `text-destructive`        | Error messages, validation text                |
| `border-destructive/30`   | Error state border on inputs                   |
| `bg-destructive/10`       | Light red tint background for alert banners    |
| `text-destructive-foreground` | Text on destructive button                 |

---

## Status Colors (Semantic Tokens)

These map to CSS variables and are used via the `.status-dot-*` utility classes in `app.css`.

| CSS Variable        | Color   | Tailwind Named Equiv    | Used for                           |
|---------------------|---------|-------------------------|------------------------------------|
| `--status-active`   | green   | `text-emerald-*`        | Active contacts, paid invoices     |
| `--status-pending`  | amber   | `text-amber-*`          | Pending, awaiting action           |
| `--status-inactive` | gray    | `text-slate-*`          | Inactive, archived                 |
| `--status-overdue`  | red     | `text-red-*`            | Overdue invoices, expired quotes   |
| `--status-lead`     | sky     | `text-sky-*`            | Leads, new contacts                |
| `--status-draft`    | gray    | `text-slate-*`          | Draft quotes, draft invoices       |

### Status Dot Classes (from app.css)

```svelte
<!-- Use these classes directly — they pull from CSS variables -->
<span class="status-dot status-dot-active" />     <!-- green dot -->
<span class="status-dot status-dot-pending" />    <!-- amber dot -->
<span class="status-dot status-dot-inactive" />   <!-- gray dot -->
<span class="status-dot status-dot-overdue" />    <!-- red dot -->
<span class="status-dot status-dot-lead" />       <!-- sky dot -->
<span class="status-dot status-dot-draft" />      <!-- gray dot -->
```

### Status Badge Trifecta Pattern (Tailwind named colors)

When you need a colored chip (badge) with background + text + border all matching, use Tailwind named colors:

```svelte
<!-- Green — active, success, accepted -->
<span class="inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-emerald-500/20 dark:text-emerald-400">
  Active
</span>

<!-- Amber — pending, warning, changes_requested -->
<span class="inline-flex items-center rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-amber-500/20 dark:text-amber-400">
  Pending
</span>

<!-- Red — overdue, declined, danger -->
<span class="inline-flex items-center rounded-full bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-700 ring-1 ring-red-500/20 dark:text-red-400">
  Overdue
</span>

<!-- Sky/Blue — lead, info, sent -->
<span class="inline-flex items-center rounded-full bg-sky-500/10 px-2 py-0.5 text-xs font-medium text-sky-700 ring-1 ring-sky-500/20 dark:text-sky-400">
  Lead
</span>

<!-- Gray — draft, inactive, neutral -->
<span class="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 ring-1 ring-slate-200 dark:bg-slate-500/10 dark:text-slate-400 dark:ring-slate-500/20">
  Draft
</span>
```

---

## Shadow Tokens

Shadows are defined in `app.css` and mapped as Tailwind custom utilities in `tailwind.config.ts`.

| Token           | Tailwind Class     | Light Mode                     | Dark Mode                                |
|-----------------|--------------------|--------------------------------|------------------------------------------|
| `--shadow-card` | `shadow-card`      | Subtle drop shadow (0.08 opac) | Inset top-highlight (invert depth trick) |
| `--shadow-dropdown` | `shadow-dropdown` | Slightly lifted               | Deeper inset highlight                   |
| `--shadow-modal` | `shadow-modal`    | Strong modal shadow            | Strong dark overlay shadow               |

```
shadow-card      → default surface elevation (use on every card)
shadow-dropdown  → hover lift, dropdowns, popovers
shadow-modal     → Dialog, Sheet, ConfirmDialog modals
```

**Dark mode shadow note:** Dark mode uses an inset top-highlight (`0 1px 0 0 rgb(255 255 255 / 0.04) inset`) instead of drop shadows. This creates the perception of depth by making the card surface appear lit from above. This is automatic — just apply the Tailwind token and both modes work correctly.

---

## App Layout Tokens (CSS Variables)

These are defined in `:root` and used in layout calculations:

```css
--sidebar-width:      240px    /* DesktopSidebar fixed width at md+ */
--header-height:      56px     /* Mobile AppHeader height */
--bottom-nav-height:  64px     /* Mobile BottomNav height */
--content-max-width:  768px    /* Soft max width for single-column content */
--radius:             0.5rem   /* Base radius → rounded-lg */
```

In Tailwind:
```
md:pl-[var(--sidebar-width)]     ← content area left padding on desktop (in app layout)
pb-[calc(var(--bottom-nav-height)+env(safe-area-inset-bottom))]  ← mobile bottom clearance
space-y-bottom-nav               ← custom spacing utility = --bottom-nav-height
min-h-touch / min-w-touch        ← 44px touch target utility
```

---

## Button Surface Tokens

These are used internally by shadcn button components. Do not reference directly — they are handled by the button component variants.

```css
--primary-deep / --primary-edge       /* gradient + border for primary button depth */
--destructive-deep / --destructive-edge /* same for destructive */
--surface-raised / --surface-raised-hover /* secondary/outline button fill */
--surface-raised-border / --surface-raised-border-hover /* secondary border */
```

---

## Custom CSS Classes (from app.css)

| Class                   | Purpose                                                  |
|-------------------------|----------------------------------------------------------|
| `.skeleton-shimmer`     | Animated shimmer for SkeletonLoader — always use this component, not the class directly |
| `.progress-indeterminate` | Sliding progress bar for indeterminate operations (no % known) |
| `.animate-spool-up`     | Jet engine spin-up animation for JetEngineButton loading state |
| `.animate-pop-in`       | Scale + overshoot pop for JetEngineButton success checkmark |
| `.snake-glow`           | Conic-gradient animated border on special hover (applied to specific CTA elements only) |
| `.status-dot`           | Base class for status indicator dots — always paired with `.status-dot-*` variant |
| `.table-container`      | `overflow-x-auto rounded-lg border` wrapper for data tables |
| `.data-table`           | Full data table style — apply to `<table>` element for headers + rows |
| `.progress-bar-track`   | Progress bar container |
| `.progress-bar-fill`    | Progress bar fill — pair with `.progress-bar-fill-green`, `-blue`, `-yellow`, `-red` |

---

## Tailwind Custom Keyframe / Animation

| Animation class     | Effect                               | Where used               |
|---------------------|--------------------------------------|--------------------------|
| `animate-spark-flash` | Icon glows green and scales briefly | Notification bell icon   |
| `animate-spool-up`  | Loader2 icon spins up (jet engine)   | JetEngineButton loading  |
| `animate-pop-in`    | Check icon scales in with overshoot  | JetEngineButton success  |
