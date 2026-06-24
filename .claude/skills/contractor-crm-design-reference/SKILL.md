---
name: contractor-crm-design-reference
description: >
  Modern, Premium, High-End SaaS UI design system for the Contractor Growth OS —
  colors, typography, component aesthetics, motion, and layout patterns.
  Load this skill whenever you are working on ANY visual aspect of the UI:
  styling components, writing Tailwind classes, updating app.css, building page
  layouts, designing cards or lists, adding animations, tweaking spacing, or
  making anything look better. Also load when the user says "design", "looks",
  "UI", "premium", "polish", "modern", or "beautiful". This skill defines the
  visual language of the entire product — never guess design decisions from memory
  when this skill is available. Load it alongside contractor-crm-svelte-ui for
  any UI task.
---

# Design Reference — Contractor Growth OS

> Target aesthetic: **Clean, Modern, Premium SaaS — like Linear, Vercel, Supabase, Craft, Notion**  
> Clean surfaces · Soft neutral grays · Generous whitespace · Purposeful motion  
> Stack: Svelte 5 · SvelteKit · shadcn-svelte · Tailwind CSS  
> Primary font: **Anthropic Sans** (self-hosted) with Geist as fallback  
> Mode: **Dark-first**, but both light and dark must always look correct  
> Never use raw hex values — always use the semantic CSS variable tokens defined in `app.css`.  
> If a new one-off color is truly needed, define it as a CSS variable in `app.css` first.

---

## Reference Files — Read Before Writing

| Task                                                         | Read first                            |
| ------------------------------------------------------------ | ------------------------------------- |
| Setting up `app.css`, color tokens, CSS variables, shadows   | `references/color-system.md`          |
| Typography — fonts, scale, hierarchy, number display         | `references/typography-and-motion.md` |
| Motion, transitions, skeleton shimmer, animations            | `references/typography-and-motion.md` |
| Card depth, surface layers, dialog blur, badge styles        | `references/component-aesthetics.md`  |
| Shared components — PageWrapper, Badge, EmptyState, etc.     | `references/component-aesthetics.md`  |
| Desktop sidebar, two-column layouts, sticky headers, grids   | `references/layout-patterns.md`       |

When in doubt, read `references/color-system.md` first — every other file depends on it.

---

## Design Philosophy (always apply)

### The 4 Rules of Premium SaaS UI

1. **Hierarchy through contrast, not size alone** — small text on a muted surface beats large text on a flat one. Use `text-muted-foreground` liberally for secondary info.
2. **Surfaces have depth** — page → card → popover each sit on a visibly different layer. Never render content on a flat, uniform background.
3. **Motion signals state, not decoration** — every transition communicates something (hover = interactive, fade = loading, slide = appeared). No gratuitous animation.
4. **Breathing room over density** — whitespace is the grid. Layouts are clean with soft neutrals, minimal borders, generous padding, large rounded corners, and subtle shadows. Think modern SaaS startup dashboard, not dense enterprise software.

### What "Premium" Looks Like in Practice

```
Page background:    bg-background (white / deep navy)
Card surface:       bg-card + border border-border/60 + shadow-card
Hover lift:         hover:shadow-dropdown hover:-translate-y-0.5
Text hierarchy:     text-foreground (primary) > text-muted-foreground (secondary) — 2 levels max per card
Radius:             rounded-xl on cards/panels, rounded-lg on inputs/buttons
Primary action:     bg-primary (brand green) — one per view
Borders:            border-border/60 at rest, border-border on focus/active
Status color:       always via semantic Badge or status-dot — never raw colored text
Empty state:        always EmptyState component — never blank whitespace
Loading state:      always SkeletonLoader — never spinner-only for page content
Desktop layout:     two-column on detail views (main content left, sidebar right)
                    single-column list pages are fine — but never narrow on wide screens
```

---

## Quick Token Reference

These are the most-used tokens. Full palette in `references/color-system.md`.

```
Backgrounds:  bg-background · bg-card · bg-card-raised · bg-muted · bg-accent/50 · bg-sidebar
Text:         text-foreground · text-muted-foreground · text-primary · text-destructive
Borders:      border-border · border-border/60 · border-border/40
Primary:      bg-primary · text-primary · ring-primary/20
Danger:       bg-destructive/10 · text-destructive · border-destructive/30
Radius:       rounded-xl (cards/panels) · rounded-lg (inputs/buttons) · rounded-full (badges/avatars)
Shadows:      shadow-card (default) · shadow-dropdown (hover lift) · shadow-modal (dialogs)
Transitions:  transition-all duration-150 ease-out  (baseline for ALL interactive elements)
Touch:        min-h-touch min-w-touch  (44px — Tailwind custom utility)
```

---

## Non-Negotiable Design Rules

- Never design dark-only. Always verify both modes render correctly.
- **Sidebar ≠ content background** — sidebar always uses `bg-sidebar` (gray-50 in light), content area uses `bg-background` (white). This split creates structural depth.
- **Touch targets ≥ 44px** — use `min-h-touch` (custom Tailwind utility = 44px) on every interactive element.
- **Transitions on all interactive elements** — `transition-all duration-150 ease-out` minimum.
- **Hover + focus always paired** — never hover-only; always include `focus-visible:ring-2 focus-visible:ring-ring`.
- **Never `alert()` or native `confirm()`** — use `ConfirmDialog` from shared components.
- **Color conveys meaning** — green = brand/primary/success/active, red = danger/error, amber = warning, sky/blue = informational. Never decorative color without semantic meaning.
- **Status always has a Badge** — never render raw status strings naked in the UI.
- **Empty states are designed** — every list/table must have an `EmptyState` component.
- **Loading states are designed** — every async operation shows `SkeletonLoader`.
- **Destructive actions are confirmed** — `ConfirmDialog` with `variant="destructive"`.
- **Section labels in sidebar** — nav groups always have a label: uppercase, tracking-wider, text-xs, text-muted-foreground. Never unlabelled groups.
- **KPI cards use icon badges** — every stat card has a colored icon container (rounded-lg, bg-primary/10 or colored variant).
- **Tables have sortable header style** — `text-xs font-medium text-muted-foreground uppercase tracking-wider` for all `<th>` elements (or use `.data-table` CSS class from app.css).
- **Borders are suggestions, not walls** — use `border-border/60` as the default. Only use `border-border` (full opacity) for active/focus states and important dividers.
- **Detail pages are two-column on desktop** — contact, quote, invoice, job, appointment detail pages must use a two-column grid at `lg:` breakpoint. See `references/layout-patterns.md` for the exact pattern.
