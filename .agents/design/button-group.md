# Button Groups

> Dependencies: `buttons.md`, `colors.md`, `radius.md`

## Core Specs

- **Wrapper:** inline-flex, `$radius-base` (8px), `$shadow-xs`
- **Overlap:** −1px left margin on all except first button
- **Buttons inside a group must NOT have individual shadows** — only the wrapper has a shadow

## Anatomy

### Wrapper
- Display: inline-flex
- Radius: 8px (`$radius-base`)
- Shadow: `$shadow-xs`

### First Button
- 8px radius on inline-start side only, 0 on inline-end

### Middle Buttons
- No radius (0 on all corners)

### Last Button
- 8px radius on inline-end side only, 0 on inline-start

### All buttons except first
- −1px left margin to collapse shared borders

## Rules

- Buttons inside groups follow all styles from `buttons.md` except individual shadows
- All buttons in a group must use the same size variant
- Icon-only buttons: 16×16px icon, match height of text buttons
- Common CRM use: view-toggle (List / Grid / Map), filter groups, date range selectors
