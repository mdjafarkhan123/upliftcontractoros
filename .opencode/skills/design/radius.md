# Border Radius

> SCSS variables: `$radius-sm`, `$radius-md`, `$radius-lg`, `$radius-xl`, `$radius-2xl`, `$radius-full`
> Runtime mirrors: `var(--radius-sm)` … `var(--radius-full)` (for use outside compiled Sass).

Radii are **generous by design** — this is not the 8px Bootstrap default. Cards sit at 20–28px.

| Token | Value | SCSS | Live usage |
|---|---|---|---|
| sm | 8px | `$radius-sm` | Buttons, small controls, sidebar active-indicator corner |
| md | 12px | `$radius-md` | Inputs / fields, icon-shape containers, nav items, dialog inner blocks |
| lg | 16px | `$radius-lg` | Dropdown / command-palette panels, larger surface panels |
| xl | 20px | `$radius-xl` | Modals / dialogs |
| 2xl | 28px | `$radius-2xl` | Cards, dashboard cards, bottom-sheet dialogs |
| full | 999px | `$radius-full` | Pills, badges, avatars, toggles, dot indicators |

## Rules

- **Cards are `$radius-2xl` (28px)** — the signature generous corner. `$radius-lg` (16px) is the acceptable floor for a denser card.
- **Inputs / fields are `$radius-md` (12px)**; buttons are `$radius-sm` (8px).
- **Never use arbitrary radius values** outside this scale.
- **Nested radii:** reduce inner radius by the inner padding. e.g. a 16px card with 8px padding containing a control → control gets ~8px radius.
- **Radius must be consistent within each component family** — do not mix values on the same component type.
- Pills use `$radius-full` — apply to badges, status chips, avatar borders, toggle thumbs.
