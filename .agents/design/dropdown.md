# Dropdown

> Dependencies: `colors.md`, `radius.md`, `shadows.md`, `inputs.md`

## Core Specs

### Chevron Icon
- Size: 16×16px
- Spacing: 6px left margin, −2px right margin
- Color: inherits from trigger

### Menu Container
- Background: `var(--neutral-primary-soft)`
- Border: 1px `var(--border-default)`
- Radius: 8px
- Shadow: `$shadow-lg`
- Z-index: `$z-dropdown` (40)
- Min width: 176px

### Menu List
- Padding: 8px
- Font: 14px, `var(--body)`, medium weight

### Menu Item
- Layout: inline-flex, vertically centered, full width
- Padding: 8px horizontal, 8px vertical
- Radius: 8px
- Hover: `var(--neutral-tertiary-medium)` background, `var(--heading)` text
- Transition: colors 150ms

## Trigger Sizes

| Size | Font | H-padding | V-padding |
|---|---|---|---|
| Small | 14px | 12px | 8px |
| Base | 14px | 16px | 10px |
| Large | 15px | 20px | 12px |

## Icon-only Trigger

- Padding: 8px
- Min size: 40×40px (touch target)
- Icon: 20×20px

## Variants

### Default
Menu width: 176px min, items 8px radius.

### With Divider
Top border (`var(--border-default)`) between child groups; skip first group.

### With Header
- Header padding: 16px horizontal, 12px vertical
- Bottom border: `var(--border-default)`
- Name: `var(--heading)`, 14px, semibold
- Email/sub: `var(--body-subtle)`, 14px, truncated

### With Icons
- Icon before label: 16×16px, 8px right margin, `var(--body)` color
- On hover: icon → `var(--heading)` color

### With Checkbox / Radio
- Inputs: 16×16px, 4px radius
- Helper text: 12px, `var(--body-subtle)`, 4px top margin

### Scrollable
- Max height: 200px, `overflow-y: auto`
- Apply `@include scrollbar-thin`

## CRM Context Dropdowns

- **Status change:** Icon + status label + color dot per status
- **Assignee picker:** Avatar (24px) + name
- **Priority selector:** Colored dot + label
- **Actions menu (⋯):** Common actions: Edit, Duplicate, Archive, Delete (danger style)

## States

| State | Appearance |
|---|---|
| Focused trigger | no outline; 2px `brand` ring |
| Hover item | `neutral-tertiary-medium` bg, `heading` text |
| Active/open item | `neutral-tertiary-soft` bg, `heading` text |
| Disabled item | `fg-disabled` text, not-allowed, no pointer |
| Danger item | `fg-danger` text; hover: `danger-soft` bg |
