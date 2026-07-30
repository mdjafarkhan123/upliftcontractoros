# Tables

> Dependencies: `colors.md`, `radius.md`, `shadows.md`

## Wrapper

- Horizontal scroll overflow (for responsive)
- Background: `var(--color-bg-surface-sunk)`
- Radius: `$radius-sm` (8px)
- Border: 1px `var(--color-border)`
- Shadow: `var(--shadow-xs)`

## Table Element

- Full width
- Left-aligned text (right-align numbers and currency)
- Font: 14px, `var(--color-text-secondary)` color

## Table Head

- Font: `$fs-caption` (12px), `var(--color-text-secondary)`, medium (500), uppercase, 0.5px letter-spacing
- Background: `var(--color-bg-app)`
- Bottom border: 1px `var(--color-border)`
- Cell padding: `$space-4` (16px) horizontal, `$space-3` (12px) vertical

### Sortable Column Header
- Chevron icon (12×12px) right of label
- Sorted asc/desc: icon rotates, text → `var(--color-text-primary)`, column cells highlight lightly

## Table Body

- Row background: `var(--color-bg-surface)`
- Row bottom border: 1px `var(--color-border)` (omit on last row)
- Row hover: `var(--color-bg-app)` background (always on for CRM data tables)
- Row header cells: medium weight, `var(--color-text-primary)` color, white-space: nowrap
- Cell padding: `$space-4` (16px) horizontal, `$space-3` (12px) vertical

## Column Types

| Type | Alignment | Notes |
|---|---|---|
| Text (name, title) | Left | Semibold for primary column |
| Currency | Right | Monospace or tabular nums |
| Number | Right | Tabular nums |
| Date | Left | `DD MMM YYYY` format |
| Status | Left | Status badge pill |
| Avatar + Name | Left | 32px avatar + name column |
| Actions | Right | Icon buttons (ghost), no text |

## Row Actions

- Visible on row hover (opacity 0 → 1 on hover)
- Layout: flex row, `$space-1` (4px) gap
- Ghost icon buttons: 32×32px
- Common: Edit (pencil), View (eye), More (⋯ dropdown)
- Destructive (Delete): shown in red in More dropdown, not inline

## Checkbox Selection (Bulk Actions)

- Column 1: 16×16px checkbox, `$radius-sm` (8px) radius
- Selected row: `var(--state-active-tint)` background
- Header checkbox: selects/deselects all
- Bulk action bar appears above table when rows are selected

## Empty State (no data)

- Centered in table body, `$space-12` (48px) vertical padding
- Icon shape (`$space-12` (48px), gray)
- Heading: `$fs-lg`/`var(--text-lg)` (16px), `var(--color-text-primary)`
- Subtext: `$fs-body`/`var(--text-body)` (14px), `var(--color-text-secondary)`
- CTA button (Brand) below subtext

## Pagination (below table)

See `pagination.md`. Position: within the table card wrapper, `$space-4` (16px) padding, top border.

## Rules

- Wrapper must have horizontal scroll overflow
- Last row: omit bottom border (avoid doubling with wrapper)
- Row headers: always `scope="row"` for semantic HTML
- Hover always enabled for CRM data tables
- No arbitrary hex codes — token colors only
- Numbers / currency: always right-aligned, use tabular-nums font-variant
