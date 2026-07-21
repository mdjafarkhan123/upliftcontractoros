# Color Tokens

> SCSS source: `scss/_variables.scss` → `scss/_theme.scss`
> All tokens become CSS custom properties: `var(--token-name)`

## Background Tokens

### Neutral
| Token | Light | Dark |
|---|---|---|
| neutral-primary-soft | #FFFFFF | #0f1f15 |
| neutral-primary | #FFFFFF | #0b1810 |
| neutral-primary-medium | #FFFFFF | #112118 |
| neutral-primary-strong | #FFFFFF | #162d20 |
| neutral-secondary-soft | #F9FAFB | #0f1f15 |
| neutral-secondary | #F9FAFB | #0b1810 |
| neutral-secondary-medium | #F9FAFB | #112118 |
| neutral-secondary-strong | #F9FAFB | #162d20 |
| neutral-tertiary-soft | #F3F4F6 | #112118 |
| neutral-tertiary | #F3F4F6 | #162d20 |
| neutral-tertiary-medium | #F3F4F6 | #1a3326 |
| neutral-quaternary | #E5E7EB | #1f3d2c |
| quaternary-medium | #E5E7EB | #2a4f38 |
| gray | #D1D5DB | #2a4f38 |

> **Dark mode note:** Dark backgrounds are green-tinted, not pure black. This reinforces the brand identity even in dark contexts.

### Brand
| Token | Light | Dark |
|---|---|---|
| brand-softer | #eaf7f0 | #071a11 |
| brand-soft | #cff0e1 | #0d2f1e |
| brand | #227d53 | #5fbd92 |
| brand-medium | #a5e0c9 | #1a6343 |
| brand-strong | #13452d | #227d53 |

### Status
| Token | Light | Dark |
|---|---|---|
| success-soft | #f0fdf4 | #052e16 |
| success | #16a34a | #22c55e |
| success-medium | #dcfce7 | #14532d |
| success-strong | #15803d | #16a34a |
| danger-soft | #fef2f2 | #450a0a |
| danger | #dc2626 | #ef4444 |
| danger-medium | #fee2e2 | #7f1d1d |
| danger-strong | #b91c1c | #dc2626 |
| warning-soft | #fffbeb | #431407 |
| warning | #f59e0b | #f59e0b |
| warning-medium | #fef3c7 | #78350f |
| warning-strong | #d97706 | #d97706 |
| info-soft | #eff6ff | #172554 |
| info | #3b82f6 | #60a5fa |
| info-medium | #dbeafe | #1e3a5f |
| info-strong | #1d4ed8 | #3b82f6 |

### Button Glint
| Variable | Light | Dark |
|---|---|---|
| `--color-1-400` | rgba(255,255,255,0.22) | rgba(255,255,255,0.10) |
| `--color-1-700` | rgba(0,0,0,0.10) | rgba(0,0,0,0.22) |

### Utility
| Token | Light | Dark |
|---|---|---|
| dark | #1F2937 | #1F2937 |
| dark-strong | #111827 | #374151 |
| disabled | #F3F4F6 | #162d20 |

---

## Text Color Tokens

### Base
| Token | Light | Dark |
|---|---|---|
| white | #FFFFFF | #FFFFFF |
| black | #111827 | #111827 |
| heading | #111827 | #F9FAFB |
| body | #4B5563 | #9CA3AF |
| body-subtle | #6B7280 | #6B7280 |

### Brand
| Token | Light | Dark |
|---|---|---|
| fg-brand-subtle | #a5e0c9 | #1a6343 |
| fg-brand | #227d53 | #5fbd92 |
| fg-brand-strong | #13452d | #a5e0c9 |

### Status
| Token | Light | Dark |
|---|---|---|
| fg-success | #15803d | #4ade80 |
| fg-success-strong | #166534 | #86efac |
| fg-danger | #dc2626 | #f87171 |
| fg-danger-strong | #b91c1c | #fca5a5 |
| fg-warning-subtle | #d97706 | #fcd34d |
| fg-warning | #b45309 | #fbbf24 |
| fg-info | #1d4ed8 | #60a5fa |
| fg-disabled | #9CA3AF | #4B5563 |

---

## Border Color Tokens

| Token | Light | Dark |
|---|---|---|
| border-dark | #1F2937 | #4B5563 |
| border-buffer | #FFFFFF | #0b1810 |
| border-buffer-medium | #FFFFFF | #0f1f15 |
| border-buffer-strong | #FFFFFF | #374151 |
| border-muted | #F9FAFB | #112118 |
| border-light-subtle | #F3F4F6 | #112118 |
| border-light | #F3F4F6 | #0f1f15 |
| border-light-medium | #F3F4F6 | #1F2937 |
| border-default-subtle | #E5E7EB | #112118 |
| border-default | #E5E7EB | #1f3d2c |
| border-default-medium | #D1D5DB | #2a4f38 |
| border-default-strong | #9CA3AF | #3d6650 |
| border-success-subtle | #dcfce7 | #14532d |
| border-success | #16a34a | #16a34a |
| border-danger-subtle | #fecaca | #7f1d1d |
| border-danger | #dc2626 | #dc2626 |
| border-warning-subtle | #fef3c7 | #78350f |
| border-warning | #d97706 | #f59e0b |
| border-brand-subtle | #a5e0c9 | #1a6343 |
| border-brand-light | #5fbd92 | #5fbd92 |
| border-brand | #227d53 | #5fbd92 |
| border-info-subtle | #dbeafe | #1e3a5f |
| border-info | #3b82f6 | #60a5fa |
| border-dark-subtle | #374151 | #374151 |

---

## Semantic Usage Rules

- Page/section backgrounds: `neutral-primary-soft` (default), `neutral-secondary-soft` (alternating)
- Primary buttons: `brand` background
- Headings: `heading` text color
- Body text: `body` text color
- CTA links: `fg-brand` text color
- Default borders: `border-default`
- Status borders match intent: success → `border-success`, danger → `border-danger`, warning → `border-warning`
- Disabled states: `disabled` background + `fg-disabled` text
- Active sidebar item: `brand-softer` background + `fg-brand-strong` text + left `border-brand` indicator

## Prohibited

- No raw hex/rgb values in component code — always use design tokens
- No brand text color (`fg-brand`) for long-form paragraphs
- No accent backgrounds for large layout surfaces (pages, sections)
- No manual light/dark value swapping — let `_theme.scss` handle it
- No inventing token names — use only tokens defined in this file
