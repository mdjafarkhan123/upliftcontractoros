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

> Target aesthetic: **Clean, Modern, Premium SaaS — like Linear, Craft, Notion, Vercel (light)**
> Clean white surfaces · Soft neutral grays · Barely-there borders · Breathing room whitespace
> Stack: Svelte 5 · SvelteKit · shadcn-svelte · Tailwind CSS and custom CSS where needed
> Mode: **Light-first with full dark parity**. The default experience is light mode.
> Dark mode is a fully supported, equally polished alternative — not an afterthought.
> Never use raw hex values — always use the semantic CSS variable tokens defined in `app.css`.
> If a new one-off color is truly needed, define it as a CSS variable in `app.css` first.

---

## Reference Files — Read Before Writing

| Task                                                         | Read first                            |
| ------------------------------------------------------------ | ------------------------------------- |
| Setting up `app.css`, color tokens, CSS variables            | `references/color-system.md`          |
| Typography — Geist font, scale, hierarchy                    | `references/typography-and-motion.md` |
| Motion, transitions, skeleton shimmer, animations            | `references/typography-and-motion.md` |
| Card depth, surface layers, dialog blur, badge styles        | `references/component-aesthetics.md`  |
| Desktop sidebar, sticky headers, command palette, page grids | `references/layout-patterns.md`       |

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
❌ Generic / wrong                     ✅ This project's standard
─────────────────────────────────────────────────────────────────
Dark zinc-900 card as default          White card, gray-50 sidebar, white content area
Heavy visible borders everywhere       border-border/60 — barely visible, 1px, soft gray
Default shadcn blue focus ring         Green focus ring (--ring token), 2px, ring-offset-background
Flat colored status text               Badge with colored bg-/10 + text- + border-/20 trifecta
No hover state on list rows            hover:bg-muted/60 with 150ms ease transition
Instant state changes                  150ms ease-out on ALL interactive elements
Sidebar same color as content          Sidebar bg-sidebar (gray-50), content bg-background (white)
No section labels in sidebar           UPPERCASE · tracking-wider · text-xs section groups
Plain nav items, no count badges       Nav item + ml-auto count pill in muted bg
Full width content wall-to-wall        max-w content with px-6 breathing room
Generic rectangles for KPI cards       Icon badge (rounded-lg, colored bg) + number + trend chip
No table pattern                       Full data table: sortable headers + badges + progress bars
No two-panel layout                    List-panel + detail-panel split for inbox/detail pages
Generic skeleton                       Shimmer skeleton matching surface bg
No empty state                         Designed EmptyState with icon + title + CTA button
```

---

## Quick Token Reference (memorise these)

These are the most-used tokens. Full palette in `references/color-system.md`.

```
Backgrounds:   bg-background · bg-card · bg-muted · bg-accent/50
Text:          text-foreground · text-muted-foreground · text-primary
Borders:       border-border · border-border/50 · border-white/5
Primary:       bg-primary · text-primary · ring-primary/20
Danger:        bg-destructive/10 · text-destructive · border-destructive/30
Radius:        rounded-lg (cards) · rounded-md (inputs/buttons) · rounded-full (badges/avatars)
Shadow:        shadow-card (default) · shadow-dropdown (hover lift) · shadow-modal (dialogs/modals)
```

---

## Non-Negotiable Design Rules

- **Light-first** — default experience is light mode. Dark mode is equally polished but secondary.
  Never design dark-only. Always verify both modes render correctly.
- **Sidebar ≠ content background** — sidebar always uses `bg-sidebar` (gray-50 in light),
  content area uses `bg-background` (white). This split creates structural depth without shadows.
- **Touch targets ≥ 44px** — `min-h-[44px]` on every interactive element.
- **Transitions on all interactive elements** — `transition-all duration-150 ease-out` minimum.
- **Hover + focus always paired** — never hover-only; always include `focus-visible:ring-2 focus-visible:ring-ring`.
- **Never `alert()` or native dialogs** — use `ConfirmDialog` from shared components.
- **Color conveys meaning** — green = brand/primary/success/active, red = danger/error, yellow/amber = warning,
  sky/blue = informational. Never decorative color without semantic meaning.
- **Status always has a Badge** — never render raw status strings naked in the UI.
- **Empty states are designed** — every list/table must have an `EmptyState` component.
- **Loading states are designed** — every async operation shows `SkeletonLoader`.
- **Destructive actions are confirmed** — `ConfirmDialog` with `variant="danger"`.
- **Section labels in sidebar** — nav groups always have a label: uppercase, tracking-wider,
  text-xs, text-muted-foreground. Never unlabelled groups.
- **KPI cards use icon badges** — every stat card has a colored icon container
  (rounded-lg, bg-primary/10 or colored variant) in the top-right corner.
- **Tables have sortable header style** — `text-xs font-medium text-muted-foreground
uppercase tracking-wider` for all table `<th>` elements.
- **Borders are suggestions, not walls** — use `border-border/60` as the default.
  Only use `border-border` (full opacity) for active/focus states and important dividers.
