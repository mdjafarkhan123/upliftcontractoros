# Color Tokens

> Live source: `src/lib/styles/_tokens.scss` (this skill mirrors it in `scss/_theme.scss`).
> Every color is a semantic CSS custom property — paint with `var(--token-name)`, never a raw hex.
> **Dark mode is NOT green-tinted.** Dark surfaces are **slate near-black** (`#222530` / `#2f333f`). Dark is not a naive inversion: brand greens brighten 1–2 ramp steps, borders become translucent white.

## Surface / Background

| Token | Light | Dark | Use |
|---|---|---|---|
| `--color-bg-app` | `#f9fafb` | `#222530` | App shell / page background |
| `--color-bg-surface` | `#ffffff` | `#2f333f` | Cards, panels, raised surfaces |
| `--color-bg-surface-sunk` | `#f7f7f7` | `#232b2f` | Insets, wells, hover fills, disabled inputs |

## Border

| Token | Light | Dark | Use |
|---|---|---|---|
| `--color-border` | `#e4e7ec` | `rgba(255,255,255,.08)` | Default hairline on cards, tables, dividers |
| `--color-border-strong` | `#d0d4dd` | `rgba(255,255,255,.14)` | Inputs, emphasis borders, hover |

## Text

| Token | Light | Dark | Use |
|---|---|---|---|
| `--color-text-primary` | `#2f333f` | `#f9fafb` | Headings, key values |
| `--color-text-secondary` | `#5a647c` | `#d0d4dd` | Body copy, labels |
| `--color-text-muted` | `#a3abbd` | `#a3abbd` | Placeholder, captions, disabled text |
| `--color-text-on-brand` | `#ffffff` | `#ffffff` | Text on a brand/solid fill |
| `--color-text-on-brand-soft` | `rgba(255,255,255,.8)` | `rgba(255,255,255,.8)` | Secondary text on brand fill (80% white) |
| `--color-text-on-brand-subtle` | `rgba(255,255,255,.7)` | `rgba(255,255,255,.7)` | Subtle text on brand fill (70% white) |

## Brand

| Token | Light | Dark | Use |
|---|---|---|---|
| `--color-brand` | `#227d53` | `#30b070` | Primary actions, active states, links |
| `--color-brand-strong` | `#13452d` | `#238052` | Deep brand, gradient stops, glint lift |
| `--color-brand-glow` | `#17f700` | `#17f700` | Neon accent — **shadows / gradient stops ONLY**, never fills or text |
| `--color-brand-rgb` | `34, 125, 83` | `48, 176, 112` | Brand RGB channels — use with `rgba(var(--color-brand-rgb), opacity)` for opacity variants |
| `--color-focus-ring` | `rgba(34,125,83,.35)` | `rgba(48,176,112,.45)` | Focus ring color (see `--shadow-focus`) |

## Status

Each status has a **`-bg`** (soft fill), **`-text`** (readable label on the soft fill), and **`-solid`** (button/badge fill, dot).

| Token | Light | Dark |
|---|---|---|
| `--success-bg` / `--success-text` / `--success-solid` | `#dbf5e8` / `#14482e` / `#238052` | `rgba(79,207,143,.14)` / `#4fcf8f` / `#30b070` |
| `--warning-bg` / `--warning-text` / `--warning-solid` | `#fef3e2` / `#92400e` / `#f59e0b` | `rgba(245,158,11,.16)` / `#fcd34d` / `#f59e0b` |
| `--danger-bg` / `--danger-text` / `--danger-solid` / `--danger-solid-rgb` | `#fde8e8` / `#b42318` / `#e11d48` / `225, 29, 72` | `rgba(225,29,72,.16)` / `#fca5a5` / `#f43f5e` / `244, 63, 94` |
| `--info-bg` / `--info-text` / `--info-solid` | `#e0eaff` / `#3538cd` / `#3b82f6` | `rgba(59,130,246,.16)` / `#93c5fd` / `#3b82f6` |
| `--cal-now-solid` (calendar "now" marker — indigo, off the brand/danger axis) | `#4f46e5` | `#6366f1` |

## Component-Specific Tints

| Token | Light | Dark | Use |
|---|---|---|---|
| `--state-active-tint` | `#effbf5` | `rgba(48,176,112,.14)` | Active sidebar item / selected row fill |
| `--avatar-fallback-bg` / `--avatar-fallback-text` | `#dbf5e8` / `#14482e` | `rgba(79,207,143,.18)` / `#83ddb0` | Initials avatar |
| `--surface-hero-from` / `--surface-hero-to` | `#13452d` / `#0d301f` | `#1a603d` / `#092014` | Hero gradient (dark brand panels) |
| `--brand-tint-strong` | `rgba(34,125,83,.2)` | `rgba(48,176,112,.22)` | Drag ghost / selected band |
| `--brand-tint-solid` | `rgba(34,125,83,.28)` | `rgba(48,176,112,.3)` | Stronger selected overlay |
| `--overlay` | `rgba(0,0,0,.5)` | `rgba(0,0,0,.5)` | Modal / sheet backdrop |
| `--overlay-soft` | `rgba(0,0,0,.4)` | `rgba(0,0,0,.4)` | Sidebar drawer backdrop |
| `--brand-glow-soft` | `rgba(34,125,83,.18)` | `rgba(48,176,112,.22)` | Soft brand glow overlay |

---

## Semantic Usage Rules

- Page / shell background: `var(--color-bg-app)`; cards/panels: `var(--color-bg-surface)`; insets & hover: `var(--color-bg-surface-sunk)`.
- Primary buttons: `var(--color-brand)` fill + `var(--color-text-on-brand)` text.
- Headings: `var(--color-text-primary)`; body: `var(--color-text-secondary)`; captions/placeholder: `var(--color-text-muted)`.
- Links / CTAs: `var(--color-brand)` text.
- Outline borders at reduced opacity: use `rgba(var(--color-brand-rgb), 0.4)` etc. instead of raw hex.
- Default borders: `var(--color-border)`; inputs/emphasis: `var(--color-border-strong)`.
- Status: soft banner = `--{status}-bg` fill + `--{status}-text`; solid button/badge/dot = `--{status}-solid`.
- Active sidebar item: `var(--state-active-tint)` background + `var(--color-brand)` text + left brand indicator.
- Disabled: `var(--color-bg-surface-sunk)` background + `var(--color-text-muted)` text.
- Overlay backdrops: `var(--overlay)` for modals, `var(--overlay-soft)` for sidebar drawers.
- Secondary text on brand backgrounds: `var(--color-text-on-brand-soft)` (80% white), `var(--color-text-on-brand-subtle)` (70% white).

## Prohibited

- **No raw hex/rgb in component code** — always a `var(--*)` token. (The hexes above are documentation of the token values, not values to type.)
- No `--color-brand-glow` for fills or text — shadows / gradient stops only.
- No brand text color for long-form paragraphs.
- No manual light/dark swapping — `_theme.scss` handles it.
- No inventing token names — use only the tokens above.
