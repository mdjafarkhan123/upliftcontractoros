# Buttons

> Dependencies: `colors.md`, `radius.md`, `shadows.md`
> Live source: `src/lib/styles/components/_button.scss` — BEM class **`.btn`** + modifiers. Use the built `ui/button` component (`feedback-shared-button-component`); never hand-roll.

## Base (`.btn`)

- **Layout:** `inline-flex`, `width: fit-content`, items + content centered, `gap: $space-2` (8px).
- **Padding:** `$space-3 $space-4` (12px 16px).
- **Radius:** `$radius-sm` (8px). (Icon buttons use `$radius-md`; pills use `$radius-full`.)
- **Font:** `$weight-semibold` (600), `$fs-body`/`$lh-body` (14px), `$font-body` (Inter).
- **Border:** none by default (variants add one where needed).
- **Transition:** `background-color` + `transform`, `$duration-fast` `$ease-standard`.
- **Hover (solid/bordered variants):** `transform: translateY(-1px)`.
- **Active:** `transform: scale(0.98)`.
- **Focus-visible:** `outline: none; box-shadow: var(--shadow-focus)` — the single app-wide ring (3px brand). Same for every variant; there is **no** per-variant focus color. (Focus ring temporarily replaces the glint box-shadow while focused.)
- **Disabled:** `opacity: 0.5; cursor: not-allowed; pointer-events: none`.

## Glint (solid-fill variants only)

`.btn--primary`, `.btn--danger`, `.btn--success` carry a **glint** — a top-edge sheen plus a colored lift shadow:

```scss
box-shadow:
  var(--shadow-xs),
  inset 0 6px 0 -5px rgba(255, 255, 255, 0.35),   // top-edge sheen
  var(--color-brand-strong) 0 4px 10px -5px;       // colored lift (danger uses var(--danger-solid))
```

Helper: `@include button-glint;` (pass the variant's strong color as the lift, e.g. `@include button-glint(var(--danger-solid))`). **Bordered/flat variants** (`--secondary`, `--outline`, `--ghost`, `--link`, `--danger-outline`, `--icon`) and **disabled** buttons get **no glint**.

## Sizes

| Modifier | Font size | Padding |
|---|---|---|
| `.btn--xs` | `$fs-caption` (12px) | `$space-1 $space-3` (4px 12px) |
| `.btn--sm` | `$fs-body` (14px) | base |
| (default) | `$fs-body` (14px) | `$space-3 $space-4` (12px 16px) |
| `.btn--lg` | `$fs-lg` (16px) | base |
| `.btn--xl` | `$fs-lg` (16px) | `$space-4 $space-6` (16px 24px) |

Sizes snap to the **4px grid** (not the off-grid px an earlier draft used). `.btn--full` sets `width: 100%`. Icon buttons override to 40×40 (`.btn--sm` → 32×32).

## Variants

### `.btn--primary`
- **Background:** `var(--color-brand)` · **Text:** `var(--color-text-on-brand)` · **Glint:** yes.
- **Hover:** `translateY(-1px)` (background unchanged).

### `.btn--secondary`
- **Background:** `var(--color-bg-surface)` · **Text:** `var(--color-text-primary)` · **Border:** `1px solid var(--color-border-strong)`.
- **Hover:** background → `var(--color-bg-surface-sunk)`, `translateY(-1px)`.

### `.btn--outline`
- **Background:** transparent · **Text:** `var(--color-text-primary)` · **Border:** `1px solid rgba(34, 125, 83, 0.4)` (brand @ 40%).
- **Hover:** border → brand @ 70%, background → `var(--state-active-tint)`, `translateY(-1px)`.

### `.btn--ghost`
- **Background:** transparent · **Text:** `var(--color-text-secondary)` · no border, no lift.
- **Hover:** background → `var(--color-bg-surface-sunk)`, text → `var(--color-text-primary)`.

### `.btn--link`
- **Background:** transparent · **Text:** `var(--color-brand)` · `padding: 0` · underlined, `text-underline-offset: 3px`.
- **Hover:** `text-decoration-thickness: 2px`.

### `.btn--danger`
- **Background:** `var(--danger-solid)` · **Text:** white · **Glint:** yes (lift = `var(--danger-solid)`).
- **Hover:** `filter: brightness(0.9)`.

### `.btn--danger-outline`
- **Background:** transparent · **Text:** `var(--danger-text)` · **Border:** `1px solid rgba(225, 29, 72, 0.4)`.
- **Hover:** border → danger @ 70%, background → `rgba(225, 29, 72, 0.06)`, `translateY(-1px)`.

### `.btn--success`
- **Background:** `var(--color-brand)` · **Text:** `var(--color-text-on-brand)` · **Glint:** yes (used by the Button success state).
- **Hover:** `filter: brightness(0.92)`.

### `.btn--warning`
- **Background:** `var(--warning-solid)` · **Text:** white · **Glint:** yes (lift = `var(--warning-solid)`).
- **Hover:** `filter: brightness(0.9)`, `translateY(-1px)`.

### `.btn--info`
- **Background:** `var(--info-solid)` · **Text:** white · **Glint:** yes (lift = `var(--info-solid)`).
- **Hover:** `filter: brightness(0.9)`, `translateY(-1px)`.

### `.btn--dark`
- **Background:** `var(--color-text-primary)` · **Text:** white · **Glint:** yes (dark lift).
- **Hover:** `filter: brightness(0.85)`, `translateY(-1px)`.
- ⚠️ **Dark-mode caveat:** `--color-text-primary` flips light in dark mode, so white text loses contrast. Prefer only in light contexts, or give it a fixed dark background later.

### `.btn--icon`
- **Size:** 40×40px (`.btn--sm` → 32×32px), `padding: 0`, `border-radius: $radius-md`.
- **Background:** `var(--color-bg-surface-sunk)` · **Text:** `var(--color-text-secondary)`.
- **Hover:** background → `var(--color-border)`, text → `var(--color-text-primary)`.

## Icons in Buttons

- Icon: always a Remix Icon (`<i class="ri-*">`), ~16px, never raw SVG.
- Gap: `$space-2` (8px) between icon and label (from base `.btn`).
- Icon-only: use `.btn--icon` (40×40, equal padding).

## Pill Variant

Add `border-radius: $radius-full` to any variant for a pill. Common for quick-add / badge-action buttons.
