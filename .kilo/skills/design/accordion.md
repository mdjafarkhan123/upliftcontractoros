# Accordion

> Dependencies: `colors.md`, `radius.md`

## Core Specs

- **Wrapper:** full width, 1px border (`var(--color-border)`), 8px radius — clips first/last corners
- **Item separator:** 1px bottom border (`var(--color-border)`) on every item except last

## Trigger (Button)

- **Layout:** flex, space-between, full width
- **Padding:** 20px horizontal, 16px vertical
- **Font:** 14px, medium (500)
- **Text:** `var(--color-text-primary)`
- **Background:** `var(--color-bg-app)`
- **Hover:** `var(--color-bg-surface-sunk)` background
- **Focus:** no outline; 2px ring in `var(--color-brand)` color
- **Open state:** `var(--color-bg-surface-sunk)` background
- **Transition:** colors 150ms

## Panel (Content)

- **Padding:** 20px horizontal, 16px vertical
- **Background:** `var(--color-bg-surface-sunk)`
- **Top border:** 1px `var(--color-border)`
- **Font:** 14px, `var(--color-text-secondary)`, 1.625 line-height

## Chevron Icon

- Size: 16×16px
- Color: `var(--color-text-secondary)`
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
| Closed | `var(--color-text-primary)` text, `var(--color-bg-app)` bg |
| Open | `var(--color-text-primary)` text, `var(--color-bg-surface-sunk)` bg |
| Hover | `var(--color-bg-surface-sunk)` bg |
| Focus | 2px `var(--color-brand)` ring, no outline |
| Disabled | `var(--color-text-muted)` text, not-allowed cursor |

## CRM Usage

- FAQ / Help sections
- Job detail sections (Description, Scope, Materials, Notes)
- Invoice line item groups
- Client contact expandable details
