---
name: "design"
description: "Professional design system for a Contractor CRM application. Use this skill for ANY UI work on the CRM — components, pages, layouts, dark/light theming, SCSS implementation. Covers the full component library: sidebars, stats cards, tables, forms, modals, badges, avatars, charts, time tracking widgets, status indicators, and all CRM module pages (Projects/Jobs, Clients, Invoices, Time Tracking, Team, Documents, Calendar, Analytics). Trigger whenever building or modifying ANY part of the Contractor CRM interface, even if the user just says 'build a page' or 'create a component'."
metadata:
  author: contractor-crm
  projectName: "Contractor CRM"
  primaryColor: "#227d53"
  primaryLight: "#5fbd92"
  primaryDeep: "#13452d"
  typographyScale: "Inter, 12/14/16/20/24/30/36/44/60px — medium labels, semibold headings"
  spacingScale: "8px base grid: 8, 12, 16, 20, 24, 32, 48, 64, 96px"
  radiusScale: "4px sm · 8px base · 12px lg · 9999px full"
  scss: "Standalone SCSS variables + mixins → CSS custom properties for runtime theming"
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

### Token System
- **Tokens are NOT Tailwind classes.** Tokens like `neutral-primary-soft`, `border-default`, `heading` are semantic names that map to CSS custom properties: `var(--neutral-primary-soft)`, `var(--border-default)`, `var(--heading)`.
- **No raw hex values** in component code — always use `var(--token-name)` for colors and `$variable` for SCSS values (spacing, radii, shadow strings, breakpoints).
- **SCSS variables** (`$radius-base`, `$shadow-xs`, `$font-size-sm`) are compile-time values — use them for properties that don't change between themes.
- **CSS custom properties** (`var(--brand)`, `var(--heading)`, `var(--border-default)`) are runtime-resolved — use them for anything that switches between light and dark mode.

### Dark Mode
- Dark mode is **automatic** via `_theme.scss`. Never manually swap color values.
- Toggle dark mode: set `data-theme="dark"` on `<html>`. OS preference is also respected automatically.
- Dark backgrounds are **green-tinted dark** (not pure black) — enforced by the token system.

### Typography
- Font: **Inter** — configured at app level, never override.
- Headings: semibold (600), `var(--heading)` color.
- Body: normal (400), `var(--body)` color.
- Always use semantic HTML: `h1`→`h6` in order, never skip levels.

### Components
- Every interactive element needs **hover, focus, and disabled** states.
- Every input must have a unique `id` with a matching label `htmlFor`.
- Cards: use `@include card-base` from `_mixins.scss` as the starting point.
- Buttons: all non-ghost/non-disabled variants get the glint box-shadow.

### Layout
- Sidebar width: 260px (desktop), hidden on mobile with toggle.
- Content area: fills remaining width.
- All sections: 96px vertical padding, 24px horizontal container padding.
- 8px spacing grid — all spacing must be multiples of 8px.

### Cross-referencing
- A card containing a button must satisfy both `cards.md` AND `buttons.md`.
- A modal with a form must satisfy `modals.md`, `inputs.md`, AND `buttons.md`.
- A sidebar with badges must satisfy `sidebars.md` AND `badges.md`.

---

## SCSS File Architecture

```
scss/
├── _variables.scss   Raw palette + layout values (never use in component code directly)
├── _mixins.scss      Helpers: flex, typography, card-base, focus-ring, glint, etc.
├── _theme.scss       Outputs all var(--token-name) for light + dark modes
└── _base.scss        CSS reset + base element styles + utility classes
```

**Usage in component files:**
```scss
@use 'scss/variables' as *;
@use 'scss/mixins' as *;

.crm-card {
  @include card-base;                     // card structure from mixin
  border-radius: $radius-base;            // SCSS var — compile-time
  color: var(--body);                     // CSS var — runtime (theme-aware)
  
  &:hover { background: var(--neutral-secondary-medium); }
  &:focus-visible { @include focus-ring-brand; }
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
