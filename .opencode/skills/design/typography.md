# Typography

> Dependencies: `colors.md`
> SCSS mixins: `heading-1/2/3`, `card-heading`, `kpi-value-xl/lg`, `body-lg/base`, `label`, `caption`, `section-label` from `scss/_mixins.scss`.

## Core Rules

- **Font:** Inter (self-hosted, weights 400/500/600/700/800), system-ui fallback — configured globally in `_base.scss`, never override per-component.
- **`html` is `62.5%` → `1rem = 10px`.** Size tokens are `rem`; **never type a raw `font-size`** — reach for a role token (`$fs-*` or `var(--text-*)`).
- **Headings:** `var(--color-text-primary)`; **body:** `var(--color-text-secondary)`; **muted/caption:** `var(--color-text-muted)`.
- **Line-heights are tight** (Jobber's signature), unitless `$lh-*` multipliers — not 1.7.
- **Semantic HTML:** `h1`–`h6` in order, never skip levels.
- **This is a desktop app** — sizes are fixed rem tokens, they do **not** scale per breakpoint.

## The Scale (Jobber "Atlantis" — the single source of truth)

| Token | rem | px | line-height | Role |
|---|---|---|---|---|
| `$fs-caption` / `var(--text-caption)` | 1.2rem | 12px | `$lh-caption` 1.143 | UPPERCASE tracked labels & badge text **ONLY** |
| `$fs-body` / `var(--text-body)` | 1.4rem | 14px | `$lh-body` 1.25 | **Default readable floor** — body, labels, table cells |
| `$fs-lg` / `var(--text-lg)` | 1.6rem | 16px | `$lh-lg` 1.34 | Emphasis / lead-in paragraph / inputs |
| `$fs-h3` / `var(--text-h3)` | 2rem | 20px | `$lh-h3` 1.2 | Section / card headings |
| `$fs-h2` / `var(--text-h2)` | 2.4rem | 24px | `$lh-h2` 1.12 | Page headings |
| `$fs-h1` / `var(--text-h1)` | 3.6rem | 36px | `$lh-h1` 1.08 | Page title |
| `$fs-display` / `var(--text-display)` | 4.8rem | 48px | `$lh-display` 1.08 | Hero stats / display |

**14px is the readable floor.** 12px (`$fs-caption`) is reserved for UPPERCASE micro-labels and badges — never sentence-case body text.

## Heading Mixins & Element Mapping

Only three heading mixins exist; map HTML elements onto the scale:

| Element | Token | Weight | Mixin |
|---|---|---|---|
| `h1` (page title) | `$fs-h1` 36px | 700 bold | `@include heading-1` |
| `h2` (page/section) | `$fs-h2` 24px | 600 semibold | `@include heading-2` |
| `h3` (section/card) | `$fs-h3` 20px | 600 semibold | `@include heading-3` / `card-heading` |
| `h4` | `$fs-lg` 16px | 600 | — (use `body-lg` + weight) |
| `h5` | `$fs-body` 14px | 600 | — |
| `h6` | `$fs-caption` 12px | 600 uppercase | `section-label` |

Weights: `$weight-regular` 400 · `$weight-medium` 500 · `$weight-semibold` 600 · `$weight-bold` 700 · `$weight-extrabold` 800.

## Paragraphs

| Role | Token | Weight | Color | Mixin |
|---|---|---|---|---|
| Lead-in / emphasis | `$fs-lg` 16px | 400 | `var(--color-text-secondary)` | `body-lg` |
| Normal paragraph | `$fs-body` 14px | 400 | `var(--color-text-secondary)` | `body-base` |
| Support / caption | `$fs-caption` 12px | 500 | `var(--color-text-muted)` | `caption` |

## Card Headings

- **`$fs-h3` (20px)** semibold, `var(--color-text-primary)` — **caps at 20px** regardless of level or breakpoint.
- Card body text mixes `$fs-body` (14px) and `$fs-lg` (16px) by role; density comes from padding/row-height, **never** from shrinking font below the 14px floor.

## UI Labels

| Context | Token | Weight |
|---|---|---|
| Button labels | `$fs-body` 14px (`.btn--lg` → 16px) | 600 |
| Input labels | `$fs-body` 14px | 500 |
| Badges | `$fs-caption` 12px | 500 |
| Table column headers | `$fs-body` 14px | 500 |
| Section labels | `$fs-caption` 12px uppercase, `$tracking-label` 0.06em | 600 |

## Numeric Data (KPI / Stat Cards)

| Token | Mixin | Usage |
|---|---|---|
| `$fs-display` 48px, 700 | `kpi-value-xl` | Hero / primary KPI value (tabular figures) |
| `$fs-h1` 36px, 600 | `kpi-value-lg` | Secondary metric |
| `$fs-h3` 20px, 600 | `card-heading` | Compact stat value |
| `$fs-body` 14px, 500 | `label` | Metric label |
| `$fs-caption` 12px, 500 | `caption` | Trend / delta text |

## Links & Emphasis

- **Inline / CTA links:** `var(--color-brand)`, same size as surrounding text, underline → hover thickens/removes.
- `<strong>` for emphasis in body; `<em>` for tone, not hierarchy.
- All-caps only for short labels via `section-label` (uppercase, `$tracking-label`, 12px).

## Dark Mode

Hierarchy is identical — only `var(--color-text-*)` values swap automatically. Sizes, weights, line-heights are constant.
