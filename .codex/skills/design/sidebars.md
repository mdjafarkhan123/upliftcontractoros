# Sidebars

> Dependencies: `colors.md`, `radius.md`, `typography.md`, `badges.md`, `avatars.md`

## Core Specs

- Background: `var(--color-bg-surface-sunk)`
- Right border: 1px `var(--color-border)`
- Width: 280px (`var(--sidebar-width)`)
- Collapsed width: 48px (collapsible sidebar; local `--c-sidebar-collapsed-width`, not a global token)
- Height: 100vh, fixed position

## Structure

```
┌─────────────────────────────┐
│  [Logo + App Name]  [Pin]   │  ← Header (64px)
├─────────────────────────────┤
│  [Search]                   │  ← Search (optional)
├─────────────────────────────┤
│  MENU                       │  ← Section label
│  ▣  Dashboard               │
│  ▣  Projects / Jobs    12+  │  ← Active item with badge
│  ▣  Clients                 │
│  ▣  Invoices                │
│  ▣  Time Tracking           │
├─────────────────────────────┤
│  GENERAL                    │  ← Section label
│  ▣  Calendar                │
│  ▣  Documents               │
│  ▣  Team                    │
│  ▣  Analytics               │
├─────────────────────────────┤
│  ▣  Settings                │
│  ▣  Help                    │
├─────────────────────────────┤
│  [CTA Card]                 │  ← Bottom promo / upgrade
├─────────────────────────────┤
│  [Avatar + Name + Email]    │  ← User profile footer
└─────────────────────────────┘
```

## Header

- Height: 64px
- Padding: 0 `$space-4` (16px)
- Layout: flex row, align-center, justify-between
- Logo: 32×32px + app name text (`$fs-lg`/`var(--text-lg)` (16px), semibold, `var(--color-text-primary)`)
- Collapse toggle: ghost icon button, right-aligned

## Inner Wrapper

- Padding: `$space-3` (12px) 10px
- Height: calc(100vh − 64px − user-footer)
- Overflow-y: auto
- `@include scrollbar-thin`

## Section Labels

- Text: `$fs-caption` (11px), uppercase, letter-spacing `$tracking-label` (0.6px), `var(--color-text-muted)`, medium
- Padding: 0 `$space-2` (8px)
- Margin: `$space-4` (16px) top, 6px (~`$space-1`) bottom

## Navigation Item

- Layout: flex row, align-center, ~`$space-2` (10px) gap
- Padding: `$space-2` (8px) 10px
- Radius: `$radius-sm` (8px)
- Text: 14px, medium, `var(--color-text-primary)` color
- Icon: `$space-5`×`$space-5` (20×20px), `var(--color-text-secondary)` color
- Transition: colors 150ms

| State | Background | Text | Icon |
|---|---|---|---|
| Default | transparent | `var(--color-text-primary)` | `var(--color-text-secondary)` |
| Hover | `var(--color-bg-surface-sunk)` | `var(--color-text-primary)` | `var(--color-text-primary)` |
| Active | `var(--state-active-tint)` | `var(--color-brand-strong)` | `var(--color-brand)` |
| Disabled | transparent | `var(--color-text-muted)` | `var(--color-text-muted)` |

**Active item left indicator:** 3px left border `var(--color-brand)`, flush to sidebar edge (negative left margin −10px, width 3px).

## Badge (Count) in Nav Item

- Right-aligned within item
- Badge: number, pill, 20px height, `var(--color-brand)` bg, white text, `$fs-caption` (11px), semibold
- Padding: 0 6px

## Separator

- Margin: `$space-4` (16px) 0
- Border-top: 1px `var(--color-border)`

## Collapsed State (64px)

- Icons only: 20×20px, centered
- Tooltip on hover showing full label
- Active indicator: 3px left border persists

## Bottom CTA Card

- Margin: 16px 0
- Padding: `$space-4` (16px)
- Radius: `$radius-sm` (8px)
- Background: `var(--state-active-tint)` (or dark card variant for app promo)
- Border: 1px `var(--color-brand)`
- Heading: 14px, semibold, `var(--color-brand-strong)`
- Body: 13px (`$fs-body`~13px), `var(--color-brand)`
- CTA button: brand variant, small size, full width

**Dark variant (app download / upgrade CTA):**
- Background: `var(--color-text-primary)` → very dark green
- Text: white
- Button: brand/green variant

## User Profile Footer

- Padding: `$space-3` (12px)
- Top border: 1px `var(--color-border)`
- Avatar: 36×36px, `$radius-full`
- Name: 14px, medium, `var(--color-text-primary)`
- Email: `$fs-caption` (12px), `var(--color-text-muted)`, truncated
- More options: ghost icon button (⋯)

## Mobile Behavior

- Hidden by default on mobile (< 1024px)
- Triggered by hamburger icon in top bar
- Displays as overlay drawer over content
- Backdrop: `var(--overlay-soft)` behind sidebar
- Close on backdrop tap or Escape key

## Multi-level Navigation (Sub-items)

- Sub-items indent: `$space-8` (32px) left padding
- Same item styling, slightly smaller text (13px, near `$fs-caption`)
- Parent item shows chevron that rotates open
- Sub-items visible when parent is active
