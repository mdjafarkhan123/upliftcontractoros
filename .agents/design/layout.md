# Layout & Spacing

> SCSS: `$space-*`, `$breakpoint-*`, `$sidebar-width` in `scss/_variables.scss`
> Mixin: `@include container` from `scss/_mixins.scss`

## Spacing Rhythm

Base unit: **8px**. All spacing values must be multiples of 8px.

| Context | Value |
|---|---|
| Section vertical padding | 96px |
| Section header → content gap | 48px or 64px |
| Heading → paragraph | 16px |
| Container horizontal padding | 24px |
| Card padding (default) | 20–24px |
| Card padding (compact) | 16px |
| Flex / grid row gap | 16px |
| Card grid gap | 24px |
| Wide component grid gap | 32px |
| Column layout gap | 48px |
| Sidebar item gap | 8px |
| Form field gap | 16px |

## App Shell Layout

```
┌─────────────────────────────────────────────┐
│  Sidebar (260px)  │  Main Content Area      │
│                   │  max-width: Not set, its fullwidth      │
│  [Nav items]      │  padding: 24–32px       │
│                   │                         │
│                   │  [Page header]          │
│                   │  [Stats row]            │
│                   │  [Grid of cards]        │
└─────────────────────────────────────────────┘
```

| Zone                | Width          | SCSS variable          |
| ------------------- | -------------- | ---------------------- |
| Sidebar             | 260px          | `$sidebar-width`       |
| Sidebar collapsed   | 64px           | `$sidebar-collapsed`   |
| Main content        | fill remaining | —                      |
| Container max-width | No max width   | `$container-max-width` |
| Container padding   | 24px           | `$container-padding`   |

## Container

```scss
.container {
  width: 100%;
  margin: 0 auto;
  padding: 0 $container-padding;
}
```

## Content Grid System

Mobile-first flexible grid.

| Context | Gap | Columns |
|---|---|---|
| Stats row (KPI cards) | 24px | 2 mobile → 4 desktop |
| Standard card grid | 24px | 1 mobile → 2 md → 3 lg |
| Compact widgets | 16px | variable |
| Full-width panels | 0 | 1 |

### Breakpoints

| Name | Value | SCSS |
|---|---|---|
| Small | 640px | `$breakpoint-sm` |
| Medium | 768px | `$breakpoint-md` |
| Large | 1024px | `$breakpoint-lg` |
| Extra large | 1280px | `$breakpoint-xl` |
| 2XL | 1536px | `$breakpoint-2xl` |

Breakpoint mixins in `_mixins.scss`:
```scss
@include sm { ... }   // ≥640px
@include md { ... }   // ≥768px
@include lg { ... }   // ≥1024px
@include xl { ... }   // ≥1280px
```

## Page Header Pattern

Each CRM page has a standard header:
- **Left:** `h1` page title (30px, semibold) + optional subtitle (14px, body)
- **Right:** Primary action button + optional secondary button
- **Bottom border:** `border-default` separator
- **Padding:** 24px vertical, flush to container

## Section Pattern

Each section has:
- 96px vertical padding
- Background alternates: `neutral-primary-soft` / `neutral-secondary-soft`
- Centered container (max-width 1280px, 24px padding)
- Section header with 48px bottom margin

## Vertical Padding by Breakpoint

| Breakpoint | Padding |
|---|---|
| Mobile | 32px |
| Tablet (≥768px) | 48px |
| Desktop (≥1024px) | 64px or 96px for hero sections |

## Z-Index Scale

| Context | Value | SCSS |
|---|---|---|
| Sidebar overlay (mobile) | 20 | `$z-sidebar` |
| Sticky header | 30 | `$z-sticky` |
| Dropdown / popover | 40 | `$z-dropdown` |
| Modal backdrop | 50 | `$z-overlay` |
| Modal content | 60 | `$z-modal` |
| Toast notifications | 70 | `$z-toast` |
| Tooltips | 80 | `$z-tooltip` |

## Motion & Animation

- Prefer CSS-native: `transition`, `animation`, `@keyframes`.
- All color transitions: 150ms ease. All transform/height transitions: 200ms ease.
- Sidebar collapse animation: 250ms ease.
- No animation on data that changes frequently (live counters, progress bars).

## Backgrounds & Visual Depth

- Clean, flat solid backgrounds for data-dense dashboard areas.
- Visual hierarchy via border separators and card elevation — no gradient meshes or textures.
- Every visual treatment serves a function: grouping, separation, or status.

## Must

- Sidebar: always 260px on desktop, hidden on mobile with a trigger
- All containers: no max width, 24px horizontal padding, centered
- All sections: 96px vertical padding
- Section headers: 48px bottom margin
- 8px grid — no arbitrary spacing values
