# Tooltips & Popovers

> Dependencies: `colors.md`, `radius.md`, `shadows.md`

## Tooltips

### Core Specs
- Padding: 8px horizontal, 6px vertical
- Font: 13px, medium (500)
- Radius: 8px
- Shadow: `$shadow-xs`
- Z-index: `$z-tooltip` (80)
- Transition: opacity 200ms ease
- Max-width: 240px

### Dark (Default)
- Background: `var(--color-text-primary)`
- Text: white
- Border: none

### Light
- Background: `var(--color-bg-surface-sunk)`
- Text: `var(--color-text-primary)`
- Border: 1px `var(--color-border)`
- Shadow: `$shadow-md`

### Tooltip Arrow
- Size: 6×6px, rotated 45deg
- Color matches parent background
- Position: center on triggering edge

## Popovers

### Core Specs
- Background: `var(--color-bg-surface)`
- Radius: 8px
- Shadow: `$shadow-lg`
- Border: 1px `var(--color-border)`
- Z-index: `$z-dropdown` (40)
- Transition: opacity 200ms, scale 150ms
- Max-width: 320px default

### Header / Title
- Padding: 12px 16px 10px
- Background: `var(--color-bg-app)`
- Bottom border: 1px `var(--color-border)`
- Font: 14px, medium, `var(--color-text-primary)`

### Body / Content
- Standard padding: 12px 16px
- Font: 14px, `var(--color-text-secondary)`, 1.5 line-height
- Rich: 16px padding

### Popover Arrow
- Size: 8×8px, rotated 45deg
- Color: matches parent background
- Border on exposed sides: 1px `var(--color-border)`

## CRM Popover Examples

### User Profile Popover (avatar click)
- 280px wide
- Header: avatar (40px) + name + email
- Divider
- Items: My Profile, Settings, Sign Out

### KPI Tooltip (stat card)
- Dark tooltip variant
- Shows metric breakdown or comparison text
- Max 180px wide

### Date Picker Popover
- 300px wide
- Calendar grid inside
- Previous/Next month navigation
- Today highlight: `var(--color-brand)` bg, white text

## Rules

- Tooltips: 8px radius, dark variant default, max 240px
- Popovers: 8px radius, bordered, shadow-lg
- Arrows match parent background color
- Always dismiss on Escape key
- Popovers: dismiss on outside click
