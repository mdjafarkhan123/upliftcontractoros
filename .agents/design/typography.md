# Typography

> Dependencies: `colors.md`
> SCSS mixin: `@include heading-1` through `@include caption` from `scss/_mixins.scss`

## Core Rules

- **Font:** Inter, system-ui fallback — configured globally in `_base.scss`, never override per-component
- **Headings:** semibold (600), `var(--heading)` color
- **Body copy:** `var(--body)` color, never use `var(--fg-brand)` for paragraphs longer than one sentence
- **Semantic HTML:** `h1`–`h6` in order, never skip levels

## Heading Scale

### Desktop

| Element | Size | Line-height | Letter-spacing | Mixin |
|---|---|---|---|---|
| `h1` | 60px | 1.0 | -0.8px | `heading-1` |
| `h2` | 44px | 1.15 | — | `heading-2` |
| `h3` | 36px | 1.2 | — | `heading-3` |
| `h4` | 30px | 1.25 | — | `heading-4` |
| `h5` | 24px | 1.5 | — | `heading-5` |
| `h6` | 20px | 1.25 | — | `heading-6` |

### Responsive (mobile-first)

| Element | Mobile | Tablet (≥768px) | Desktop (≥1024px) |
|---|---|---|---|
| `h1` | 32px | 40px | 60px |
| `h2` | 28px | 36px | 44px |
| `h3` | 24px | 30px | 36px |
| `h4` | 22px | 26px | 30px |
| `h5` | 20px | 22px | 24px |
| `h6` | 18px | 18px | 20px |

Never reduce line-height below 1.1 for any heading.

## Paragraphs

| Role | Size | Weight | Color | Line-height | Max-width |
|---|---|---|---|---|---|
| Leading paragraph | 20px | 400 | body | 1.7 | ~70ch |
| Normal paragraph | 16px | 400 | body | 1.7 | ~65ch |
| Small / support copy | 14px | 400 | body | 1.6 | — |

Small copy only for: helper text, legal text, captions, metadata, table cell content.

## Card Headings

- Desktop: 20px, semibold, `var(--heading)`
- Mobile: 16px, semibold, `var(--heading)`
- **Max 20px** regardless of heading level or breakpoint — never exceed inside a card
- Never skip heading levels arriving at the card heading level

## UI Labels

| Context | Size | Weight |
|---|---|---|
| Button labels | 14–16px | 500 (medium) |
| Input labels | 14px | 500 (medium) |
| Badges / captions / meta | 12–14px | 500 (medium) |
| Table column headers | 14px | 500 (medium) |
| Sidebar nav items | 14px | 500 (medium) |

Do not apply paragraph line-height (1.7) to control labels.

## Links

- **Inline links:** same size as surrounding text, `var(--fg-brand)`, underline, hover → no underline
- **CTA links:** `var(--fg-brand)`, medium weight, underline, hover → no underline

## Emphasis

- `<strong>` for high-priority emphasis in body text
- `<em>` for tone emphasis only, not visual hierarchy
- All-caps only for short labels: uppercase, 0.4px letter-spacing, 11–12px size

## Numeric Data (KPI / Stat Cards)

| Size | Usage |
|---|---|
| 44px, semibold | Primary KPI value (e.g. total jobs count) |
| 30px, semibold | Secondary metric |
| 20px, semibold | Compact stat card value |
| 14px, medium | Metric label |
| 12px, medium | Trend / delta text |

## Dark Mode

Typography hierarchy stays identical. Only `var(--heading)` and `var(--body)` token values change automatically — sizes, weights, and spacing remain constant.
