# Borders

## Width Scale

| Context | Width |
|---|---|
| Default (inputs, buttons, cards, tables) | 1px |
| Left active indicator (sidebar) | 3px |

**Focus is not a wider border.** Inputs keep their 1px border, **recolor it to `var(--color-brand)`**, and add the focus ring `box-shadow: var(--shadow-focus)`. Never swap to a 2px border on focus.

## Rules

- Use solid borders by default.
- Dashed borders only for file dropzones and placeholder upload areas.
- Components in the same family use matching border widths.
- Left-border active indicator (sidebar): 3px solid `var(--color-brand)`.

## Usage by Component

| Context | Width | Color token |
|---|---|---|
| Inputs / selects / textareas | 1px (recolor to brand on focus + `--shadow-focus`) | `var(--color-border-strong)` → `var(--color-brand)` on focus |
| Buttons (secondary / outlined) | 1px | `var(--color-border-strong)` (outline uses brand @ 40%) |
| Cards / containers | 1px | `var(--color-border)` |
| Tables wrapper | 1px | `var(--color-border)` |
| Table rows | 1px bottom | `var(--color-border)` |
| Sidebar active indicator | 3px left | `var(--color-brand)` |
| Section dividers | 1px | `var(--color-border)` |
| Dropdown menu | 1px | `var(--color-border)` |
| Modal header/footer | 1px top/bottom | `var(--color-border)` |
