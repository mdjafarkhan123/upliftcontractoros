# Tabs

> Dependencies: `colors.md`, `radius.md`, `shadows.md`

## Core Specs

- Font: 14px, medium (500), `var(--body)` color
- Transitions: all 200ms ease

## Variants

### 1. Underline (Default)

**Wrapper:** bottom border 1px `var(--border-default)`

**Tab Item:**
- Padding: 16px horizontal, 14px vertical
- Bottom border: 2px transparent
- Top corners: 8px radius
- Transition: colors 150ms

| State | Appearance |
|---|---|
| Active | `var(--fg-brand)` text, `var(--border-brand)` bottom border |
| Inactive | transparent bottom border; hover → `var(--heading)`, `var(--border-default-strong)` bottom |
| Disabled | `var(--fg-disabled)` text, not-allowed cursor |

### 2. Pills

**Tab Item:**
- Padding: 10px horizontal, 8px vertical
- Radius: 8px
- Font weight: medium
- Transition: all 200ms

| State | Appearance |
|---|---|
| Active | `var(--brand)` bg, white text, `$shadow-sm` |
| Inactive | `var(--body)` text; hover → `var(--neutral-secondary-soft)` bg, `var(--heading)` text |
| Disabled | `var(--fg-disabled)` text, not-allowed |

### 3. Full Width

Children: −1px left margin on all except first.

**Tab Item:**
- Full width, centered text
- Padding: 14px horizontal, 14px vertical
- Background: `var(--neutral-primary-soft)`
- Border: 1px `var(--border-default)`
- Hover: `var(--neutral-secondary-medium)` bg, `var(--heading)` text

| State | Appearance |
|---|---|
| Active | `var(--neutral-secondary-soft)` bg, `var(--fg-brand)` text |
| First | rounded start (8px) |
| Last | rounded end (8px) |

## Tabs with Icons

- Icon: 16×16px, 8px right margin
- Layout: inline-flex, vertically centered
- Icons inherit tab state text color

## Tabs with Count Badge

- Count pill: right of label, 16px height min, `$radius-full`
- Active state: white bg, `var(--brand)` text
- Inactive state: `var(--neutral-quaternary)` bg, `var(--body)` text

## CRM Tab Contexts

| Page | Tab labels |
|---|---|
| Project detail | Overview · Tasks · Documents · Time · Notes |
| Client detail | Summary · Projects · Invoices · Contacts |
| Invoice | Details · Line Items · Payments · History |
| Analytics | Revenue · Jobs · Team · Time |
