# Badges

> Dependencies: `colors.md`, `radius.md`
> See also: `status-indicators.md` for CRM-specific job/project status badges

## Core Specs

- **Border:** 1px
- **Default radius:** 8px (`$radius-base`)
- **Pill radius:** 9999px (`$radius-full`) — preferred for status badges
- **Font weight:** 500 (medium)

## Sizes

| Size | Font size | Horizontal padding | Vertical padding |
|---|---|---|---|
| Default (small) | 12px | 6px | 2px |
| Large | 14px | 10px | 4px |

## Variants

### Brand
- **Background:** `var(--brand-softer)`
- **Border:** `var(--border-brand-subtle)`
- **Text:** `var(--fg-brand-strong)`

### Alternative (Neutral Soft)
- **Background:** `var(--neutral-primary-soft)`
- **Border:** `var(--border-default)`
- **Text:** `var(--heading)`

### Gray (Neutral Medium)
- **Background:** `var(--neutral-secondary-medium)`
- **Border:** `var(--border-default)`
- **Text:** `var(--heading)`

### Danger
- **Background:** `var(--danger-soft)`
- **Border:** `var(--border-danger-subtle)`
- **Text:** `var(--fg-danger-strong)`

### Success
- **Background:** `var(--success-soft)`
- **Border:** `var(--border-success-subtle)`
- **Text:** `var(--fg-success-strong)`

### Warning
- **Background:** `var(--warning-soft)`
- **Border:** `var(--border-warning-subtle)`
- **Text:** `var(--fg-warning)`

### Info
- **Background:** `var(--info-soft)`
- **Border:** `var(--border-info-subtle)`
- **Text:** `var(--fg-info)`

### Dark
- **Background:** `var(--dark)`
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
| Brand | `brand-soft` |
| Alternative | `neutral-tertiary` |
| Gray | `neutral-quaternary` |
| Danger | `danger-medium` |
| Success | `success-medium` |
| Warning | `warning-medium` |

## Dot / Notification Badge

- Positioned absolutely: −4px top, −4px right
- Size: 10×10px, `$radius-full`
- 2px border in `var(--border-buffer)` color
- Background: `var(--danger)` for alerts; `var(--brand)` for counts

## Number Badge (Task Count in Sidebar)
- Size: auto width, min 20px, 20px height
- Radius: `$radius-full`
- Background: `var(--brand)`
- Text: white, 11px, semibold
- Padding: 0 6px
