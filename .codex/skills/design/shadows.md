# Shadows

> Live source: `_tokens.scss` (theme layer). Shadows are **runtime, theme-aware** — always `box-shadow: var(--shadow-*)`, never a Sass `$` shadow (they must switch with dark mode).
> Shadows are **tinted dark-green** `rgba(13,21,15,…)` (not pure black) for warmth. In dark mode they deepen toward black and the glow gets brighter neon.

## Tokens (light mode values)

| Token | Value |
|---|---|
| `--shadow-xs` | `0 1px 2px rgba(13,21,15,.04)` |
| `--shadow-sm` | `0 2px 6px rgba(13,21,15,.05)` |
| `--shadow-md` | `0 8px 20px rgba(13,21,15,.06)` |
| `--shadow-lg` | `0 16px 40px rgba(13,21,15,.07)` |
| `--shadow-xl` | `0 24px 56px rgba(13,21,15,.09)` |
| `--shadow-glow` | `0 20px 48px rgba(19,69,45,.35), 0 0 0 1px rgba(23,247,0,.06)` — brand neon lift |
| `--shadow-focus` | `0 0 0 3px rgba(34,125,83,.35)` — the single focus ring |

There is **no** `shadow-2xs` / `shadow-2xl`. The scale is xs → xl, plus `glow` and `focus`.

**Dark mode:** xs–xl switch to heavier pure-black (`rgba(0,0,0,.4)`→`.6`); `--shadow-glow` becomes a stronger neon-green halo; `--shadow-focus` brightens.

## Component Mapping

| Component | Token |
|---|---|
| Inputs, buttons, small controls | `--shadow-xs` (buttons also carry the glint box-shadow) |
| Standard cards, stat cards | `--shadow-sm` (hover → `--shadow-md`) |
| Prominent panels, sticky header | `--shadow-md` |
| Dropdown menus, popovers | `--shadow-lg` |
| Modals, overlays | `--shadow-xl` |
| Hero / featured brand surfaces (sparingly) | `--shadow-glow` |
| Any focus-visible element | `--shadow-focus` |

## Rules

- Use only these tokens — no custom `box-shadow` values (the button glint is the one documented multi-layer exception).
- Elevation steps must be intentional — never jump multiple levels.
- Interactive elevated elements (card hover, dropdown open): step up one level.
- `--shadow-glow` is a brand moment — never on dense list items or body containers.
