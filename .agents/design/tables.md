# Tables

> Dependencies: `colors.md`, `radius.md`, `shadows.md`

## Wrapper

- Horizontal scroll overflow (for responsive)
- Background: `var(--neutral-primary-soft)`
- Radius: 8px
- Border: 1px `var(--border-default)`
- Shadow: `var(--shadow-xs)`

## Table Element

- Full width
- Left-aligned text (right-align numbers and currency)
- Font: 14px, `var(--body)` color

## Table Head

- Font: 12px, `var(--body)`, medium (500), uppercase, 0.5px letter-spacing
- Background: `var(--neutral-secondary-soft)`
- Bottom border: 1px `var(--border-default)`
- Cell padding: 16px horizontal, 12px vertical

### Sortable Column Header
- Chevron icon (12×12px) right of label
- Sorted asc/desc: icon rotates, text → `var(--heading)`, column cells highlight lightly

## Table Body

- Row background: `var(--neutral-primary)`
- Row bottom border: 1px `var(--border-default)` (omit on last row)
- Row hover: `var(--neutral-secondary-soft)` background (always on for CRM data tables)
- Row header cells: medium weight, `var(--heading)` color, white-space: nowrap
- Cell padding: 16px horizontal, 12px vertical

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
- Layout: flex row, 4px gap
- Ghost icon buttons: 32×32px
- Common: Edit (pencil), View (eye), More (⋯ dropdown)
- Destructive (Delete): shown in red in More dropdown, not inline

## Checkbox Selection (Bulk Actions)

- Column 1: 16×16px checkbox, `$radius-sm` (8px) radius
- Selected row: `var(--brand-softer)` background
- Header checkbox: selects/deselects all
- Bulk action bar appears above table when rows are selected

## Empty State (no data)

- Centered in table body, 48px vertical padding
- Icon shape (48px, gray)
- Heading: 16px, `var(--heading)`
- Subtext: 14px, `var(--body)`
- CTA button (Brand) below subtext

## Pagination (below table)

See `pagination.md`. Position: within the table card wrapper, 16px padding, top border.

## Rules

- Wrapper must have horizontal scroll overflow
- Last row: omit bottom border (avoid doubling with wrapper)
- Row headers: always `scope="row"` for semantic HTML
- Hover always enabled for CRM data tables
- No arbitrary hex codes — token colors only
- Numbers / currency: always right-aligned, use tabular-nums font-variant
