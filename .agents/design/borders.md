# Borders

## Width Scale

| Context | Width |
|---|---|
| Default (inputs, buttons, cards, tables) | 1px |
| Focus / error emphasis | 2px |

## Rules

- Use solid borders by default
- Dashed borders only for file dropzones and placeholder upload areas
- Components in the same family use matching border widths
- Never mix 1px and 2px borders within a single component
- Left-border active indicator (sidebar, tabs): 3px solid `var(--border-brand)`

## Usage by Component

| Context | Width | Color token |
|---|---|---|
| Inputs / selects / textareas | 1px default; 2px on focus or error | `border-default-medium` → `border-brand` on focus |
| Buttons (outlined variants) | 1px | `border-default-medium` |
| Cards / containers | 1px | `border-default` |
| Tables wrapper | 1px | `border-default` |
| Table rows | 1px bottom | `border-default` |
| Sidebar active indicator | 3px left | `border-brand` |
| Section dividers | 1px | `border-default` |
| Dropdown menu | 1px | `border-default` |
| Modal header/footer | 1px top/bottom | `border-default` |
