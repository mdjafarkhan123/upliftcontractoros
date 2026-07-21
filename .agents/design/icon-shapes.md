# Icon Shapes

> Dependencies: `colors.md`, `radius.md`

## Core Specs

- Box sizing: border-box
- Icon must be perfectly centered: display inline-flex, align-items center, justify-content center
- Circle: `$radius-full`
- Rounded square: `$radius-base` (8px) for MD/LG/XL; `$radius-sm` (4px) for XS/SM

## Sizes

| Size | Container | Icon |
|---|---|---|
| XS | 24×24px | 14×14px |
| SM | 32×32px | 16×16px |
| MD | 40×40px | 20×20px |
| LG | 48×48px | 24×24px |
| XL | 56×56px | 28×28px |

## Color Variants

### Brand
- Background: `var(--brand-softer)`
- Icon color: `var(--fg-brand-strong)`

### Gray
- Background: `var(--neutral-secondary-soft)`
- Icon color: `var(--body)`

### Danger
- Background: `var(--danger-soft)`
- Icon color: `var(--fg-danger-strong)`

### Success
- Background: `var(--success-soft)`
- Icon color: `var(--fg-success-strong)`

### Warning
- Background: `var(--warning-soft)`
- Icon color: `var(--fg-warning)`

### Info
- Background: `var(--info-soft)`
- Icon color: `var(--fg-info)`

## CRM Module Icon Usage

Used in sidebar navigation, empty states, and module headers:

| Module | Icon | Shape variant |
|---|---|---|
| Dashboard | grid-2x2 | Brand |
| Projects / Jobs | briefcase | Brand |
| Clients | users | Gray |
| Invoices | file-text | Success |
| Time Tracking | clock | Warning |
| Team | user-check | Gray |
| Documents | folder | Gray |
| Calendar | calendar | Info |
| Analytics | bar-chart | Brand |
| Settings | settings | Gray |
