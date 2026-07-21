# Badges

> Dependencies: `colors.md`, `radius.md`
> See also: `status-indicators.md` for CRM-specific job/project status badges

## Core Specs

- **Border:** 1px
- **Default radius:** pill (`$radius-full`)
- **Pill radius:** 9999px (`$radius-full`) — preferred for status badges
- **Font weight:** 500 (medium)

## Sizes

| Size | Font size | Horizontal padding | Vertical padding |
|---|---|---|---|
| Default (small) | 12px | 6px | 2px |
| Large | 14px | 10px | 4px |

## Variants

### Brand
- **Background:** `var(--state-active-tint)`
- **Border:** `var(--color-brand)`
- **Text:** `var(--color-brand-strong)`

### Alternative (Neutral Soft)
- **Background:** `var(--color-bg-surface-sunk)`
- **Border:** `var(--color-border)`
- **Text:** `var(--color-text-primary)`

### Gray (Neutral Medium)
- **Background:** `var(--color-bg-surface-sunk)`
- **Border:** `var(--color-border)`
- **Text:** `var(--color-text-primary)`

### Danger
- **Background:** `var(--danger-bg)`
- **Border:** `var(--danger-solid)`
- **Text:** `var(--danger-solid)`

### Success
- **Background:** `var(--success-bg)`
- **Border:** `var(--success-solid)`
- **Text:** `var(--success-solid)`

### Warning
- **Background:** `var(--warning-bg)`
- **Border:** `var(--warning-solid)`
- **Text:** `var(--warning-text)`

### Info
- **Background:** `var(--info-bg)`
- **Border:** `var(--info-solid)`
- **Text:** `var(--info-text)`

### Dark
- **Background:** `var(--color-text-primary)`
- **Border:** transparent
- **Text:** white

## Pill Badges

Use `$radius-full` on any variant for pill shape — this is the standard for CRM status chips.

## Badges with Icons

- Icon size (default): 12×12px; (large): 14×14px
- Icon spacing: 4px margin next to label

## Icon-only Badge

Square: equalize to 24×24px (default) or 28×28px (large). No horizontal text padding.

## Dismissible Badges

Badge content + a close (×) button inline.

| Variant | Close hover background |
|---|---|
| Brand | `var(--state-active-tint)` |
| Alternative | `var(--color-bg-surface-sunk)` |
| Gray | `var(--color-border-strong)` |
| Danger | `var(--danger-bg)` |
| Success | `var(--success-bg)` |
| Warning | `var(--warning-bg)` |

## Dot / Notification Badge

- Positioned absolutely: −4px top, −4px right
- Size: 10×10px, `$radius-full`
- 2px border in `var(--color-border)` color
- Background: `var(--danger-solid)` for alerts; `var(--color-brand)` for counts

## Number Badge (Task Count in Sidebar)
- Size: auto width, min 20px, 20px height
- Radius: `$radius-full`
- Background: `var(--color-brand)`
- Text: white, 11px, semibold
- Padding: 0 6px
