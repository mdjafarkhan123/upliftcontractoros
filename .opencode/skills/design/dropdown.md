# Dropdown

> Dependencies: `colors.md`, `radius.md`, `shadows.md`, `inputs.md`

## Core Specs

### Chevron Icon
- Size: 16×16px
- Spacing: 6px (~`$space-1`) left margin, −2px right margin
- Color: inherits from trigger

### Menu Container
- Background: `var(--color-bg-surface-sunk)`
- Border: 1px `var(--color-border)`
- Radius: `$radius-sm` (8px)
- Shadow: `$shadow-lg`
- Z-index: `$z-dropdown` (250)
- Min width: 176px

### Menu List
- Padding: `$space-2` (8px)
- Font: `$fs-body`/`var(--text-body)` (14px), `var(--color-text-secondary)`, medium weight

### Menu Item
- Layout: inline-flex, vertically centered, full width
- Padding: `$space-2` (8px) horizontal, `$space-2` (8px) vertical
- Radius: `$radius-sm` (8px)
- Hover: `var(--color-border)` background, `var(--color-text-primary)` text
- Transition: colors 150ms

## Trigger Sizes

| Size | Font | H-padding | V-padding |
|---|---|---|---|
| Small | 14px | `$space-3` (12px) | `$space-2` (8px) |
| Base | 14px | `$space-4` (16px) | 10px |
| Large | 15px | `$space-5` (20px) | `$space-3` (12px) |

## Icon-only Trigger

- Padding: `$space-2` (8px)
- Min size: 40×40px (touch target)
- Icon: 20×20px (`$space-5`)

## Variants

### Default
Menu width: 176px min, items `$radius-sm` (8px) radius.

### With Divider
Top border (`var(--color-border)`) between child groups; skip first group.

### With Header
- Header padding: `$space-4` (16px) horizontal, `$space-3` (12px) vertical
- Bottom border: `var(--color-border)`
- Name: `var(--color-text-primary)`, `$fs-body`, semibold
- Email/sub: `var(--color-text-muted)`, 14px, truncated

### With Icons
- Icon before label: 16×16px, `$space-2` (8px) right margin, `var(--color-text-secondary)` color
- On hover: icon → `var(--color-text-primary)` color

### With Checkbox / Radio
- Inputs: 16×16px, `$radius-xs` (4px)
- Helper text: `$fs-caption` (12px), `var(--color-text-muted)`, `$space-1` (4px) top margin

### Scrollable
- Max height: 200px, `overflow-y: auto`
- Apply `@include scrollbar-thin`

## CRM Context Dropdowns

- **Status change:** Icon + status label + color dot per status
- **Assignee picker:** Avatar (`$space-6` (24px)) + name
- **Priority selector:** Colored dot + label
- **Actions menu (⋯):** Common actions: Edit, Duplicate, Archive, Delete (danger style)

## States

| State | Appearance |
|---|---|
| Focused trigger | no outline; 2px `var(--color-brand)` ring |
| Hover item | `var(--color-border)` bg, `var(--color-text-primary)` text |
| Active/open item | `var(--color-bg-surface-sunk)` bg, `var(--color-text-primary)` text |
| Disabled item | `var(--color-text-muted)` text, not-allowed, no pointer |
| Danger item | `var(--danger-text)` text; hover: `var(--danger-bg)` bg |
