# Inputs

> Dependencies: `colors.md`, `radius.md`

## Core Specs

- **Display:** block, full width
- **Radius:** 8px (`$radius-base`)
- **Border:** 1px solid `var(--border-default-medium)`
- **Background:** `var(--neutral-secondary-medium)`
- **Shadow:** `$shadow-xs`
- **Font:** 14px, `var(--heading)` color
- **Padding:** 12px horizontal, 10px vertical
- **Placeholder:** `var(--body)` color
- **Transition:** all 200ms ease

## Label

- Display: block
- Font: 14px, medium (500), `var(--heading)` color
- Margin bottom: 8px
- `htmlFor` must match input `id`

## States

| State | Border | Background | Ring |
|---|---|---|---|
| Default | `border-default-medium` | `neutral-secondary-medium` | — |
| Hover | `border-default-strong` | `neutral-secondary-medium` | — |
| Focus | `border-brand` | `neutral-secondary-medium` | 1px `var(--brand)` |
| Success | `border-success` | `neutral-secondary-medium` | 1px `var(--success)` |
| Error / Danger | `border-danger` | `neutral-secondary-medium` | 1px `var(--danger)` |
| Disabled | `border-light` | `disabled` | — |

Focus ring: `box-shadow: 0 0 0 1px var(--brand)`. Not an outline.

## Input with Icons

- Icon size: 16×16px, `var(--body)` color
- Container: relative-positioned wrapper
- **Start icon:** absolute left 12px; input `padding-left: 36px`
- **End icon:** absolute right 12px; input `padding-right: 36px`
- Icons vertically centered (top 50%, translateY -50%)

## Input with Prefix/Suffix (CRM)

Used for currency inputs (`$`, unit labels):
- Prefix: left-attached box, `var(--neutral-tertiary)` bg, `var(--border-default-medium)` right border, 12px padding
- Suffix: right-attached box, same styling
- Input: 8px radius on attached side set to 0

## Textarea

Same specs as input. Additional:
- Min-height: 100px
- Resize: vertical only
- Line-height: 1.625

## Select

Same border/background/radius as input. Additional:
- Custom chevron icon (16×16px), absolutely positioned right 12px
- Appearance: none (remove browser default arrow)
- Right padding: 36px (for chevron)

## Helper / Error Text

- Font: 12px, normal
- Margin top: 6px
- Error: `var(--fg-danger)` color
- Helper: `var(--body-subtle)` color

## Search Input (CRM Global Search)

- Width: 280px default (expandable on focus to 360px)
- Left icon: search icon 16×16px
- Right shortcut badge: keyboard shortcut pill, 12px font, `neutral-tertiary` bg
- Radius: 8px

## Rules

- Every input must have a unique `id`
- Every label must have matching `htmlFor`
- No arbitrary hex — use only design tokens
- Always provide visible error messages, not just border color changes
