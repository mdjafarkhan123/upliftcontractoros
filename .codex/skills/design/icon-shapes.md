# Icon Shapes

> Dependencies: `colors.md`, `radius.md`

## Core Specs

- Box sizing: border-box
- Icon must be perfectly centered: display inline-flex, align-items center, justify-content center
- Circle: `$radius-full`
- Rounded square: `$radius-md` (12px) for MD/LG/XL; `$radius-sm` (8px) for XS/SM

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
- Background: `var(--state-active-tint)`
- Icon color: `var(--color-brand-strong)`

### Gray
- Background: `var(--color-bg-app)`
- Icon color: `var(--color-text-secondary)`

### Danger
- Background: `var(--danger-bg)`
- Icon color: `var(--danger-solid)`

### Success
- Background: `var(--success-bg)`
- Icon color: `var(--success-solid)`

### Warning
- Background: `var(--warning-bg)`
- Icon color: `var(--warning-text)`

### Info
- Background: `var(--info-bg)`
- Icon color: `var(--info-text)`

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
