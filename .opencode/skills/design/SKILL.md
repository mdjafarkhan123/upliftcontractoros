---
name: "design"
description: "Professional design system for a Contractor CRM application. Use this skill for ANY UI work on the CRM — components, pages, layouts, dark/light theming, SCSS implementation. Covers the full component library: sidebars, stats cards, tables, forms, modals, badges, avatars, charts, time tracking widgets, status indicators, and all CRM module pages (Projects/Jobs, Clients, Invoices, Time Tracking, Team, Documents, Calendar, Analytics). Trigger whenever building or modifying ANY part of the Contractor CRM interface, even if the user just says 'build a page' or 'create a component'."
metadata:
  author: contractor-crm
  projectName: "Contractor CRM"
  primaryColor: "#227d53"
  primaryDeep: "#13452d"
  brandGlow: "#17f700 (neon accent — shadows/gradient stops ONLY)"
  typographyScale: "Inter, rem @ 1rem=10px (html 62.5%), Jobber Atlantis 12/14/16/20/24/36/48px — semibold headings, unitless tight line-heights"
  spacingScale: "4px base grid: 4, 8, 12, 16, 20, 24, 28, 32, 40, 48, 64, 80px"
  radiusScale: "8px sm · 12px md · 16px lg · 20px xl · 28px 2xl · 999px full"
  scss: "src/lib/styles/_tokens.scss ($ vars + var(--color-*) theme) + app.scss (base); this skill mirrors them"
---

# Contractor CRM — Design System Agent Instructions

A professional, data-dense dashboard design system for a Contractor CRM. Clean white surfaces with deep forest-green brand accents. Built for clarity, speed, and reliability — the tool contractors trust on the job site and in the office.

---

## Before Writing Any Code

**Read every module that applies.** For any page or component, load these foundation files first:

```
layout.md · typography.md · colors.md · shadows.md · radius.md · borders.md
```

Then load the component-specific files. **Do not write a single line of SCSS until you have read all relevant modules.**

For SCSS implementation files, always import in this order:
```scss
@use 'scss/variables' as *;
@use 'scss/mixins' as *;
// _theme.scss is imported globally at root level (outputs CSS custom properties)
```

---

## Critical Rules

> **This skill documents the LIVE app tokens** in `src/lib/styles/_tokens.scss` + `app.scss`. The `scss/` folder here mirrors them 1:1. When you change a token in the app, update this skill in the same turn (`feedback-sync-tokens-to-skill` rule).

### Token System
- **Tokens are NOT Tailwind classes.** Colors are semantic CSS custom properties: `var(--color-bg-surface)`, `var(--color-border)`, `var(--color-text-primary)`, `var(--color-brand)`, `var(--success-solid)`, etc. See `colors.md` for the full contract.
- **No raw hex values** in component code — always use `var(--color-*)` (and `var(--shadow-*)`) for anything that switches with theme, and `$variable` for SCSS values (spacing, radii, type scale, motion, breakpoints).
- **SCSS variables** (`$radius-lg`, `$fs-body`, `$space-4`, `$duration-base`) are compile-time — use for values that never change between themes.
- **CSS custom properties** (`var(--color-brand)`, `var(--color-text-primary)`, `var(--color-border)`, `var(--shadow-sm)`) are runtime-resolved — use for anything theme-dependent.

### Dark Mode
- Dark mode is **automatic** via `_theme.scss` (mirrors the app's `dark-theme-tokens` mixin). Never manually swap color values.
- Toggle: set `data-theme="dark"` on `<html>` (explicit in-app choice); OS `prefers-color-scheme` is respected when no explicit choice is set.
- Dark surfaces are **slate near-black** (`#222530`/`#2f333f`), not green-tinted. Dark mode is not a naive inversion: brand greens brighten 1–2 ramp steps, borders become translucent white, `--shadow-glow` gets more prominent.

### Typography
- Font: **Inter** (self-hosted, weights 400/500/600/700/800) — configured at app level, never override.
- **`html` is `62.5%` so `1rem = 10px`.** Size tokens are `rem` (`$fs-body: 1.4rem = 14px`); line-heights (`$lh-*`) are unitless Jobber-exact multipliers. **Never type a raw `font-size`** — use a role token (`$fs-*` or `var(--text-*)`).
- Scale (Jobber "Atlantis"): `$fs-caption` 12 · `$fs-body` 14 · `$fs-lg` 16 · `$fs-h3` 20 · `$fs-h2` 24 · `$fs-h1` 36 · `$fs-display` 48.
- Headings: `var(--color-text-primary)`; body: `var(--color-text-secondary)`; muted: `var(--color-text-muted)`. 14px is the readable floor; 12px (`$fs-caption`) is for UPPERCASE tracked labels & badges ONLY.
- Card fonts cap at `$fs-h3` (20px). Always use semantic HTML `h1`→`h6` in order.

### Components
- Every interactive element needs **hover, focus, and disabled** states.
- Every input must have a unique `id` with a matching label `htmlFor`.
- Cards: use `@include card-base` from `_mixins.scss` as the starting point.
- Focus: the single app-wide ring is `box-shadow: var(--shadow-focus)` (mixin `focus-ring`).

### Layout
- Sidebar width: **280px** (`var(--sidebar-width)`), desktop; hidden on mobile with toggle. Header height **56px** (`var(--header-height)`), bottom-nav **64px**.
- Content area: fills remaining width.
- **4px spacing grid** — all spacing is a `$space-*` step (4/8/12/16/20/24/28/32/40/48/64/80).
- Radii are generous: cards `$radius-lg` (16px) up to `$radius-2xl` (28px); inputs `$radius-sm` (8px); pills `$radius-full`.

### Cross-referencing
- A card containing a button must satisfy both `cards.md` AND `buttons.md`.
- A modal with a form must satisfy `modals.md`, `inputs.md`, AND `buttons.md`.
- A sidebar with badges must satisfy `sidebars.md` AND `badges.md`.

---

## SCSS File Architecture

```
scss/
├── _variables.scss   $ tokens: brand, ramps, 4px spacing, radii, $fs-*/$lh- type scale, motion, z, breakpoints
├── _mixins.scss      Optional helpers: flex, typography, card-base, input-base, focus-ring, scrollbar-thin (app has none — these use real tokens)
├── _theme.scss       Outputs all var(--color-*) / var(--text-*) / var(--shadow-*) for light + dark
└── _base.scss        @font-face, reset, html{62.5%}, body, scrollbar, focus, status-dot, keyframes
```

> In the real app these live as one file, `src/lib/styles/_tokens.scss` (variables + theme), plus `app.scss` (base). This skill splits them for readability but the values are identical.

**Usage in component files:**
```scss
@use 'scss/variables' as *;
@use 'scss/mixins' as *;

.crm-card {
  @include card-base;                        // bg/border/radius-lg/shadow from mixin
  padding: $space-5;                         // SCSS var — compile-time (20px)
  color: var(--color-text-primary);          // CSS var — runtime (theme-aware)

  &:hover { box-shadow: var(--shadow-md); }
  &:focus-visible { @include focus-ring; }   // box-shadow: var(--shadow-focus)
}
```

---

## Module Index

### Foundation (read first for any UI work)
| File | Content |
|---|---|
| [brand.md](brand.md) | Brand identity, logo, color precedence |
| [colors.md](colors.md) | Full color token system — all background, text, border tokens |
| [typography.md](typography.md) | Type scale, headings, body, UI labels |
| [layout.md](layout.md) | Grid, spacing rhythm, containers, sidebar layout |
| [radius.md](radius.md) | Border radius tokens |
| [shadows.md](shadows.md) | Shadow scale and component mapping |
| [borders.md](borders.md) | Border width rules |

### Core Components
| File | Content |
|---|---|
| [buttons.md](buttons.md) | All button variants, sizes, states, glint |
| [button-group.md](button-group.md) | Grouped buttons |
| [cards.md](cards.md) | Static and interactive cards |
| [inputs.md](inputs.md) | Text inputs, textareas, selects |
| [alerts.md](alerts.md) | Status banners |
| [badges.md](badges.md) | Status pills, labels |
| [lists.md](lists.md) | Icon lists |
| [avatars.md](avatars.md) | Avatar sizes, stacked, with text |
| [icon-shapes.md](icon-shapes.md) | Icon container shapes |
| [accordion.md](accordion.md) | Expand/collapse panels |
| [dropdown.md](dropdown.md) | Dropdown menus |
| [modals.md](modals.md) | Dialog overlays |
| [tabs.md](tabs.md) | Tab navigation |
| [tables.md](tables.md) | Data tables |
| [pagination.md](pagination.md) | Page navigation |
| [sidebars.md](sidebars.md) | Left navigation sidebar |
| [radios-checkboxes-toggle.md](radios-checkboxes-toggle.md) | Selection controls |
| [tooltips-popovers.md](tooltips-popovers.md) | Tooltips and popovers |
| [content.md](content.md) | Content grid and layout system |

### CRM-Specific Components
| File | Content |
|---|---|
| [status-indicators.md](status-indicators.md) | Job/project status, pipeline stages, priority |
| [stats-cards.md](stats-cards.md) | KPI metric cards, trend indicators, featured stats |
| [data-display.md](data-display.md) | Bar charts, gauge/donut, progress bars, timelines |

### Project Governance (read before hand-rolling any primitive)
| File | Content |
|---|---|
| [ui-primitives.md](ui-primitives.md) | **UI Primitives Registry** — the canonical built primitives in `src/lib/components/ui/` + import paths, the **Styling Law** (shared BEM classes live in global `src/lib/styles/components/_*.scss`, never a scoped `<style>`), and the native-input ban (enforced by `eslint-rules/local-plugin.js`). Grep `src/lib/components/ui/` before building anything new. |
