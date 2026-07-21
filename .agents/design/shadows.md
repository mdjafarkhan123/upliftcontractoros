# Shadows

> SCSS variables: `$shadow-2xs` through `$shadow-2xl` in `scss/_variables.scss`
> Use as: `box-shadow: $shadow-xs` (compile-time) or via `var(--shadow-xs)` (runtime)

| Token | CSS value |
|---|---|
| shadow-2xs | `0 1px rgb(0 0 0 / 0.05)` |
| shadow-xs | `0 1px 2px 0 rgb(0 0 0 / 0.05)` |
| shadow-sm | `0 1px 3px 0 rgb(0 0 0 / 0.10), 0 1px 2px -1px rgb(0 0 0 / 0.10)` |
| shadow-md | `0 4px 6px -1px rgb(0 0 0 / 0.10), 0 2px 4px -2px rgb(0 0 0 / 0.10)` |
| shadow-lg | `0 10px 15px -3px rgb(0 0 0 / 0.10), 0 4px 6px -4px rgb(0 0 0 / 0.10)` |
| shadow-xl | `0 20px 25px -5px rgb(0 0 0 / 0.10), 0 8px 10px -6px rgb(0 0 0 / 0.10)` |
| shadow-2xl | `0 25px 50px -12px rgb(0 0 0 / 0.25)` |

## Component Mapping

| Component type | Token |
|---|---|
| Subtle separators, tiny UI details | shadow-2xs or shadow-xs |
| Inputs, buttons, small controls | shadow-xs |
| Standard cards, stat cards | shadow-xs or shadow-sm |
| Dropdown menus, popovers | shadow-lg |
| Prominent panels, sticky header | shadow-md |
| Modals, overlays | shadow-xl |
| Hero / top-level (sparingly) | shadow-2xl |

## Rules

- Use only these tokens — no custom `box-shadow` values
- Elevation steps must be intentional — never jump multiple levels
- Components in the same family share the same baseline elevation
- Interactive elevated elements (card hover, dropdown open): step up one level
- Never stack multiple shadow tokens on one element
- Never use `shadow-xl` / `shadow-2xl` for dense list items or body containers
