# Sidebars

> Dependencies: `colors.md`, `radius.md`, `typography.md`, `badges.md`, `avatars.md`

## Core Specs

- Background: `var(--neutral-primary-soft)`
- Right border: 1px `var(--border-default)`
- Width: 260px (`$sidebar-width`)
- Collapsed width: 64px (`$sidebar-collapsed`)
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
- Padding: 0 16px
- Layout: flex row, align-center, justify-between
- Logo: 32×32px + app name text (16px, semibold, `var(--heading)`)
- Collapse toggle: ghost icon button, right-aligned

## Inner Wrapper

- Padding: 12px 10px
- Height: calc(100vh − 64px − user-footer)
- Overflow-y: auto
- `@include scrollbar-thin`

## Section Labels

- Text: 11px, uppercase, letter-spacing 0.6px, `var(--body-subtle)`, medium
- Padding: 0 8px
- Margin: 16px top, 6px bottom

## Navigation Item

- Layout: flex row, align-center, 10px gap
- Padding: 8px 10px
- Radius: 8px
- Text: 14px, medium, `var(--heading)` color
- Icon: 20×20px, `var(--body)` color
- Transition: colors 150ms

| State | Background | Text | Icon |
|---|---|---|---|
| Default | transparent | `heading` | `body` |
| Hover | `neutral-secondary-medium` | `heading` | `heading` |
| Active | `brand-softer` | `fg-brand-strong` | `fg-brand` |
| Disabled | transparent | `fg-disabled` | `fg-disabled` |

**Active item left indicator:** 3px left border `var(--border-brand)`, flush to sidebar edge (negative left margin −10px, width 3px).

## Badge (Count) in Nav Item

- Right-aligned within item
- Badge: number, pill, 20px height, `var(--brand)` bg, white text, 11px, semibold
- Padding: 0 6px

## Separator

- Margin: 16px 0
- Border-top: 1px `var(--border-default)`

## Collapsed State (64px)

- Icons only: 20×20px, centered
- Tooltip on hover showing full label
- Active indicator: 3px left border persists

## Bottom CTA Card

- Margin: 16px 0
- Padding: 16px
- Radius: 8px
- Background: `var(--brand-softer)` (or dark card variant for app promo)
- Border: 1px `var(--border-brand-subtle)`
- Heading: 14px, semibold, `var(--fg-brand-strong)`
- Body: 13px, `var(--fg-brand)`
- CTA button: brand variant, small size, full width

**Dark variant (app download / upgrade CTA):**
- Background: `var(--dark-strong)` → very dark green
- Text: white
- Button: brand/green variant

## User Profile Footer

- Padding: 12px
- Top border: 1px `var(--border-default)`
- Avatar: 36×36px, `$radius-full`
- Name: 14px, medium, `var(--heading)`
- Email: 12px, `var(--body-subtle)`, truncated
- More options: ghost icon button (⋯)

## Mobile Behavior

- Hidden by default on mobile (< 1024px)
- Triggered by hamburger icon in top bar
- Displays as overlay drawer over content
- Backdrop: `rgba(0,0,0,0.4)` behind sidebar
- Close on backdrop tap or Escape key

## Multi-level Navigation (Sub-items)

- Sub-items indent: 32px left padding
- Same item styling, slightly smaller text (13px)
- Parent item shows chevron that rotates open
- Sub-items visible when parent is active
