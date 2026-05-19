---
name: contractor-crm-design-reference
description: >
  Modern,Premium, High End SaaS UI design system for the Contractor Growth OS — colors, typography,
  component aesthetics, motion, and layout patterns. Load this skill whenever you
  are working on ANY visual aspect of the UI: styling components, writing Tailwind
  classes, updating app.css, building page layouts, designing cards or lists,
  adding animations, tweaking spacing, or making anything look better. Also load
  when the user says "design", "looks", "UI", "premium", "polish", "modern", or
  "Dribbble". This skill defines the visual language of the entire product — never
  guess design decisions from memory when this skill is available. Load it alongside
  contractor-crm-svelte-ui for any UI task.
---

# Design Reference — Contractor Growth OS

> Target aesthetic: **Modern, Permium, High-End like: Supabase, Vercel etc** — Dark first then light mode, crisp, information-dense, premium, high end.
> Stack: Svelte 5 · SvelteKit · shadcn-svelte · Tailwind CSS and custom css where need
> Mode: **Dark-first**. Light mode is secondary. Base all designs on the dark palette.
> Never use raw hex values or hardcoded colours but if needs be then you can use but add that value as varibale with proper naming in 'app.css' — always use the semantic tokens defined.

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
4. Clean whitespace-heavy layouts
   Soft neutral backgrounds
   Minimal borders
   Large rounded corners
   Calm professional feel
   Modern startup/SaaS dashboard style
   Elegant typography hierarchy
   Subtle shadows only
   Smooth spacing rhythm
   Lightweight UI, not dense enterprise UI
   Premium but simple

### What "Premium" Looks Like in Practice

```
❌ Generic shadcn default              ✅ This project's standard
─────────────────────────────────────────────────────────────────
Flat white/gray card                   Zinc-900 card, zinc-800 border, subtle shadow
Default blue focus ring                Indigo-500 ring, 2px offset
Plain text labels                      Muted-foreground labels, foreground values
No hover state on list rows            Hover:bg-accent/50 with 150ms ease
Instant state changes                  150ms ease-out transitions on all interactions
Full-width content, no max-width       max-w-2xl centered with px-4 side padding
Generic skeleton                       Shimmer animation skeleton
No empty state                         Illustrated EmptyState with action CTA
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
Shadow:        shadow-sm (default) · shadow-md (hover lift) · shadow-xl (modals)
```

---

## Non-Negotiable Design Rules

- **Dark-first** — design for dark mode, verify light mode works, never the reverse
- **Touch targets ≥ 44px** — `min-h-[44px]` on every interactive element (already in svelte-ui skill — enforce here too)
- **Transitions on all interactive elements** — `transition-all duration-150 ease-out` minimum
- **Hover + focus always paired** — never hover-only states; always include `focus-visible:ring-2`
- **Never `alert()` or native dialogs** — use `ConfirmDialog` from shared components
- **Colour conveys meaning** — green = success/active, red = danger/error, yellow = warning, blue/indigo = info/primary. Never use colour decoratively without semantic meaning.
- **Status always has a Badge** — never render raw status strings naked in the UI
- **Empty states are designed** — every list/table must have an `EmptyState` component, never a blank void
- **Loading states are designed** — every async operation shows `SkeletonLoader`, never a blank flash
- **Destructive actions are confirmed** — `ConfirmDialog` with `variant="danger"`, never bare onclick delete
