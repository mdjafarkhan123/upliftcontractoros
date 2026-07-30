# Avatars

> Dependencies: `colors.md`, `radius.md`
> SCSS mixin: `@include avatar($size, $radius)` from `scss/_mixins.scss`

## Core Specs

- **Circular shape:** `$radius-full` (9999px)
- **Rounded square shape:** `$radius-sm` (8px)
- **Default size:** 40×40px
- **Image fit:** object-fit: cover
- **Fallback:** initials on `var(--state-active-tint)` background, `var(--color-brand)` text

## Sizes

| Size | Dimensions | Circle | Rounded Square |
|---|---|---|---|
| Extra Small | 18×18px | full | 4px |
| Small | 24×24px | full | 4px |
| Base | 32×32px | full | 8px |
| Medium | 40×40px | full | 8px |
| Large | 44×44px | full | 8px |
| XL | 56×56px | full | 8px |
| 2XL | 64×64px | full | 8px |

## Initials Fallback

When no image is available:
- Background: user-assigned color from a fixed palette (8 options: brand green, sky, purple, orange, teal, pink, indigo, amber)
- Text: white, semibold
- Font size: container height × 0.35 (rounded to nearest px)

## Bordered Avatar

- `$space-1` (4px) padding, `$radius-full`, 2px outline in `var(--color-border)` color
- Alternative: `box-shadow: 0 0 0 2px var(--color-border), 0 0 0 4px var(--color-border)`

## Stacked Avatars

- Flex row
- Each avatar: 36×36px, `$radius-full`, 2px border in `var(--color-border)` color
- Overlap: −12px (~`$space-3`) negative margin on all except first
- Max display: 4 avatars + counter

### Stacked Counter
- Same size as avatars (36×36px), `$radius-full`
- Background: `var(--color-text-primary)`, text: white, `$fs-caption` (12px), semibold
- Same overlap margin as other avatars

## Avatar with Text

- Flex row, `$space-2` (10px) gap between avatar and text block
- Avatar: 40×40px, `$radius-full`, cover fit
- Name: `var(--color-text-primary)`, medium weight, `$fs-body` (14px)
- Subtitle: 13px (`$fs-body`~13px), `var(--color-text-secondary)` color
- Used in: sidebar user profile, team member rows, client contacts

## Online Indicator

- 10×10px dot, `$radius-full`
- Background: `var(--success-solid)` (online) / `var(--color-text-muted)` (offline)
- Position: absolute, 0px bottom, 0px right
- Border: 2px `var(--color-border)`
