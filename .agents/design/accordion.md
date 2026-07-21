# Accordion

> Dependencies: `colors.md`, `radius.md`

## Core Specs

- **Wrapper:** full width, 1px border (`var(--border-default)`), 8px radius — clips first/last corners
- **Item separator:** 1px bottom border (`var(--border-default)`) on every item except last

## Trigger (Button)

- **Layout:** flex, space-between, full width
- **Padding:** 20px horizontal, 16px vertical
- **Font:** 14px, medium (500)
- **Text:** `var(--heading)`
- **Background:** `var(--neutral-secondary-soft)`
- **Hover:** `var(--neutral-tertiary-soft)` background
- **Focus:** no outline; 2px ring in `var(--brand)` color
- **Open state:** `var(--neutral-tertiary-soft)` background
- **Transition:** colors 150ms

## Panel (Content)

- **Padding:** 20px horizontal, 16px vertical
- **Background:** `var(--neutral-primary-soft)`
- **Top border:** 1px `var(--border-default)`
- **Font:** 14px, `var(--body)`, 1.625 line-height

## Chevron Icon

- Size: 16×16px
- Color: `var(--body)`
- Closed: rotate(0deg)
- Open: rotate(180deg)
- Transition: transform 150ms ease

## Variants

### Default (Collapse)
One panel open at a time. Single shared bordered/rounded wrapper.

### Separated Cards
Each item independent — own 1px border, 8px radius, `$shadow-xs`. 8px margin between items. No shared outer wrapper.

### Always Open
Multiple panels can expand simultaneously. Same styling as Default.

### Flush
No outer border. Transparent backgrounds. Only bottom border dividers. Use inside containers that already provide background.

## States

| State | Trigger appearance |
|---|---|
| Closed | `heading` text, `neutral-secondary-soft` bg |
| Open | `heading` text, `neutral-tertiary-soft` bg |
| Hover | `neutral-tertiary-soft` bg |
| Focus | 2px `brand` ring, no outline |
| Disabled | `fg-disabled` text, not-allowed cursor |

## CRM Usage

- FAQ / Help sections
- Job detail sections (Description, Scope, Materials, Notes)
- Invoice line item groups
- Client contact expandable details
