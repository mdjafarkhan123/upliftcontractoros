# Cards

> Dependencies: `colors.md`, `radius.md`, `shadows.md`, `typography.md`
> SCSS mixin: `@include card-base` from `scss/_mixins.scss`

## Core Specs

- **Background:** `var(--color-bg-surface-sunk)`
- **Border:** 1px solid `var(--color-border)`
- **Radius:** 16px (`$radius-lg`) — cards are generous; can go up to `$radius-2xl` (28px)
- **Shadow:** `$shadow-xs`

## Card Heading

- Desktop: 20px, semibold, `var(--color-text-primary)`
- Mobile: 16px, semibold, `var(--color-text-primary)`
- **Max 20px** — card headings must never exceed 20px regardless of heading level or breakpoint
- Never skip heading levels arriving at the card heading level

## States

### Static Card (no interactivity)
- Background: `var(--color-bg-surface-sunk)`
- Border: 1px `var(--color-border)`
- Radius: 8px
- Shadow: `$shadow-xs`
- **No hover styles** — non-interactive cards must NOT have hover background changes

### Interactive Card (clickable)
- Same base as static card
- **Hover:** `var(--color-bg-surface-sunk)` background
- Transition: colors 150ms ease
- Cursor: pointer

## Variants

### Default Card
Standard padding: 20px all sides. Used for most dashboard panels.

### Compact Card
Padding: 16px. Used for sidebar widgets, inline panels.

### Featured / Highlight Card (KPI Primary)
- Background: `var(--color-brand)` → deep green
- Border: transparent
- Text: white
- Shadow: `$shadow-sm`
- Used for the primary metric (Total Projects, Total Revenue, etc.)
- Heading: white, 20px max
- Body text: `rgba(255,255,255,0.80)`

### Dark Card
- Background: `var(--color-text-primary)` → very dark (used for Time Tracker, CTAs)
- Border: transparent
- Text: white
- Accent elements: `var(--color-brand-glow)` → #5fbd92

### Section Card (full-width container)
- Background: `var(--color-bg-surface-sunk)`
- Border: 1px `var(--color-border)`
- Radius: 8px
- Padding: 24px
- Contains its own heading + content

## Card Header Pattern (when a card has a header row)
- Flex row: title (left) + actions (right)
- Bottom border: 1px `var(--color-border)`
- Padding: 16px 20px
- Title: 16px, semibold, `var(--color-text-primary)`
- Actions: ghost or secondary buttons, or badges

## Rules

- `@include card-base` provides: background, border, radius, shadow
- Interactive cards must always have cursor: pointer + hover state
- Non-interactive: no hover styles, no cursor change
- Never add shadows heavier than `$shadow-sm` to standard cards
- Featured card is always brand green — use sparingly (one per stats row)
