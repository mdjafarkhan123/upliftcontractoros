# Border Radius

> SCSS variables: `$radius-sm`, `$radius-base`, `$radius-lg`, `$radius-full`

| Token | Value | SCSS | Default usage |
|---|---|---|---|
| sm | 4px | `$radius-sm` | Checkboxes, tags, tiny indicators |
| base | 8px | `$radius-base` | Buttons, cards, inputs, modals, dropdowns |
| lg | 12px | `$radius-lg` | Large panels, hero sections, dialogs |
| full | 9999px | `$radius-full` | Pills, avatars, toggles, dot indicators, status badges |

## Rules

- **8px is the default** across the product — cards, inputs, buttons, modals all use 8px
- **Never use arbitrary radius values** outside this scale
- **Nested radii:** reduce inner radius by inner padding. e.g. an 8px card with 8px padding containing a button → button gets 4px radius
- **Radius must be consistent within each component family** — do not mix 8px and 12px on the same component type
- Pills use `$radius-full` — apply to badges, status chips, avatar borders, toggle thumbs
