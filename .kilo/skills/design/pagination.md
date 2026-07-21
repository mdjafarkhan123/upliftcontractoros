# Pagination

> Dependencies: `colors.md`, `radius.md`

## Container

Font: 14px. Items as flex row with −1px overlap for seamless borders.
Layout: flex row, align-center, justify between results-text (left) and page controls (right).

## Results Text (Left)
- "Showing 1–25 of 143 results"
- Font: 14px, `var(--color-text-secondary)`

## Pagination Item

- Layout: flex, centered both axes
- Size: 36×36px
- Text: `var(--color-text-secondary)`, medium weight
- Background: `var(--color-bg-surface-sunk)`
- Border: 1px `var(--color-border-strong)`
- Hover: `var(--color-border)` background, `var(--color-text-primary)` text
- Focus: no outline; 2px `var(--color-brand)` ring
- Overlap: −1px left margin

## Previous / Next Buttons

- Horizontal padding: 12px, height: 36px
- First item: 8px radius inline-start
- Last item: 8px radius inline-end

## Active Page Item

- Text: `var(--color-brand)` color
- Background: `var(--color-border)`
- Hover: stays same

## Ellipsis (…)

- Same size as items: 36×36px
- Non-interactive: `var(--color-text-secondary)` text, no hover

## Per-Page Selector

- Small select (from `inputs.md`) showing "25 per page"
- Options: 10, 25, 50, 100
- Right of results text or right of page controls

## Rules

- Display flex with −1px child overlap
- Items: `var(--color-bg-surface-sunk)` bg, `var(--color-border-strong)` border, `var(--color-text-secondary)` text
- Active: `var(--color-brand)` text, `var(--color-border)` bg
- First item: rounded start; Last item: rounded end
- All items need hover and focus states
