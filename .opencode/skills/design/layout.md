# Layout & Spacing

> SCSS: `$space-*`, `$bp-tablet` / `$bp-mobile`, plus layout CSS vars (`var(--sidebar-width)`, `var(--header-height)`, `var(--bottom-nav-height)`) in `_tokens.scss`.
> Mixins: `@include container`, `@include tablet-down`, `@include mobile-down` from `scss/_mixins.scss`.
> **This is a DESKTOP web app — desktop is THE target.** Mobile is a low-priority reflow, never a co-priority. Breakpoint mixins are **max-width** (desktop-first).

## Spacing Rhythm

Base unit: **4px**. All spacing is a `$space-*` step — never an arbitrary value.

`$space-1` 4 · `$space-2` 8 · `$space-3` 12 · `$space-4` 16 · `$space-5` 20 · `$space-6` 24 · `$space-7` 28 · `$space-8` 32 · `$space-10` 40 · `$space-12` 48 · `$space-16` 64 · `$space-20` 80.

| Context | Value |
|---|---|
| Container horizontal padding | 24px (`$space-6`) |
| Card padding (default) | 20–24px (`$space-5`/`$space-6`) |
| Card padding (compact) | 16px (`$space-4`) |
| Flex / grid row gap | 16px (`$space-4`) |
| Card grid gap | 24px (`$space-6`) |
| Sidebar item gap | 8px (`$space-2`) |
| Form field gap | 16px (`$space-4`) |

## App Shell Layout

```
┌─────────────────────────────────────────────┐
│  Sidebar (280px)  │  Main Content Area       │
│                   │  max-width: none (full)  │
│  [Nav items]      │  padding: 24px           │
│                   │  [Page header]           │
│                   │  [Stats row]             │
│                   │  [Grid of cards]         │
└─────────────────────────────────────────────┘
```

| Zone | Value | Token |
| --- | --- | --- |
| Sidebar width | 280px | `var(--sidebar-width)` |
| Header height | 56px | `var(--header-height)` |
| Bottom nav (mobile) | 64px | `var(--bottom-nav-height)` |
| Main content | fills remaining | — |
| Container max-width | none (full width) | — |
| Container padding | 24px | `$space-6` |

## Container

The `container` mixin (no max-width, centered, 24px side padding):
```scss
.container {
  width: 100%;
  margin: 0 auto;
  padding: 0 $space-6;   // 24px
}
```

## Breakpoints (desktop-first, max-width)

Only **two** breakpoints exist — the app is tuned for wide desktop and reflows down.

| Name | Value | SCSS | Mixin |
|---|---|---|---|
| Tablet | 1024px | `$bp-tablet` | `@include tablet-down { … }` (< 1024px) |
| Mobile | 640px | `$bp-mobile` | `@include mobile-down { … }` (< 640px) |

```scss
.thing {
  // desktop styles are the default
  @include tablet-down { /* ≤1023px reflow */ }
  @include mobile-down { /* ≤639px reflow */ }
}
```

## Page Header Pattern

- **Left:** `h1` page title (`$fs-h1` 36px, or `$fs-h2` 24px for denser pages) + optional subtitle (`$fs-body` 14px, `var(--color-text-secondary)`).
- **Right:** primary action button + optional secondary.
- **Bottom border:** `1px solid var(--color-border)` separator.
- **Padding:** 24px vertical, flush to container.

## Z-Index Scale

Live values (deliberately spaced so portaled menus inside modals sit above the modal):

| Context | Value | SCSS |
|---|---|---|
| Sticky header | 200 | `$z-sticky` |
| Dropdown / Select | 250 | `$z-dropdown` |
| Modal / overlay backdrop | 900 | `$z-overlay` |
| Modal content | 1000 | `$z-modal` |
| Popover from inside a modal | 1050 | `$z-popover` |
| Toast notifications | 1100 | `$z-toast` |
| Tooltips | 1200 | `$z-tooltip` |

## Motion & Animation

- Prefer CSS-native: `transition`, `animation`, `@keyframes`.
- Durations: `$duration-fast` **120ms** · `$duration-base` **180ms** · `$duration-slow` **280ms**.
- Easing: `$ease-standard` `cubic-bezier(0.4, 0, 0.2, 1)`; `$ease-spring` `cubic-bezier(0.34, 1.56, 0.64, 1)`.
- No animation on data that changes frequently (live counters, progress bars).

## Backgrounds & Visual Depth

- Clean, flat solid backgrounds for data-dense dashboard areas (`var(--color-bg-app)` shell, `var(--color-bg-surface)` cards, `var(--color-bg-surface-sunk)` insets).
- Visual hierarchy via border separators and card elevation — no gradient meshes or textures.
- Every visual treatment serves a function: grouping, separation, or status.

## Must

- Sidebar: always 280px on desktop, hidden on mobile with a trigger.
- Containers: no max width, 24px horizontal padding, centered.
- **4px grid — no arbitrary spacing values.**
- Tune and verify every screen on a wide desktop viewport first.
