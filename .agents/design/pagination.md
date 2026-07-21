# Pagination

> Dependencies: `colors.md`, `radius.md`

## Container

Font: 14px. Items as flex row with −1px overlap for seamless borders.
Layout: flex row, align-center, justify between results-text (left) and page controls (right).

## Results Text (Left)
- "Showing 1–25 of 143 results"
- Font: 14px, `var(--body)`

## Pagination Item

- Layout: flex, centered both axes
- Size: 36×36px
- Text: `var(--body)`, medium weight
- Background: `var(--neutral-secondary-medium)`
- Border: 1px `var(--border-default-medium)`
- Hover: `var(--neutral-tertiary-medium)` background, `var(--heading)` text
- Focus: no outline; 2px `var(--brand)` ring
- Overlap: −1px left margin

## Previous / Next Buttons

- Horizontal padding: 12px, height: 36px
- First item: 8px radius inline-start
- Last item: 8px radius inline-end

## Active Page Item

- Text: `var(--fg-brand)` color
- Background: `var(--neutral-tertiary-medium)`
- Hover: stays same

## Ellipsis (…)

- Same size as items: 36×36px
- Non-interactive: `var(--body)` text, no hover

## Per-Page Selector

- Small select (from `inputs.md`) showing "25 per page"
- Options: 10, 25, 50, 100
- Right of results text or right of page controls

## Rules

- Display flex with −1px child overlap
- Items: `neutral-secondary-medium` bg, `border-default-medium` border, `body` text
- Active: `fg-brand` text, `neutral-tertiary-medium` bg
- First item: rounded start; Last item: rounded end
- All items need hover and focus states
