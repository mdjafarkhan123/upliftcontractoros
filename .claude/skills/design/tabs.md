# Tabs

> Dependencies: `colors.md`, `radius.md`, `shadows.md`

## Core Specs

- Font: `$fs-body`/`var(--text-body)` (14px), medium (500), `var(--color-text-secondary)` color
- Transitions: all 200ms ease

## Variants

### 1. Underline (Default)

**Wrapper:** bottom border 1px `var(--color-border)`

**Tab Item:**
- Padding: `$space-4` (16px) horizontal, 14px vertical
- Bottom border: 2px transparent
- Top corners: `$radius-sm` (8px)
- Transition: colors 150ms

| State | Appearance |
|---|---|
| Active | `var(--color-brand)` text, `var(--color-brand)` bottom border |
| Inactive | transparent bottom border; hover → `var(--color-text-primary)`, `var(--color-border-strong)` bottom |
| Disabled | `var(--color-text-muted)` text, not-allowed cursor |

### 2. Pills

**Tab Item:**
- Padding: `$space-2` (10px) horizontal, `$space-2` (8px) vertical
- Radius: `$radius-sm` (8px)
- Font weight: medium
- Transition: all 200ms

| State | Appearance |
|---|---|
| Active | `var(--color-brand)` bg, white text, `$shadow-sm` |
| Inactive | `var(--color-text-secondary)` text; hover → `var(--color-bg-app)` bg, `var(--color-text-primary)` text |
| Disabled | `var(--color-text-muted)` text, not-allowed |

### 3. Full Width

Children: −1px left margin on all except first.

**Tab Item:**
- Full width, centered text
- Padding: 14px horizontal, 14px vertical
- Background: `var(--color-bg-surface-sunk)`
- Border: 1px `var(--color-border)`
- Hover: `var(--color-bg-surface-sunk)` bg, `var(--color-text-primary)` text

| State | Appearance |
|---|---|
| Active | `var(--color-bg-app)` bg, `var(--color-brand)` text |
| First | rounded start (8px) |
| Last | rounded end (8px) |

## Tabs with Icons

- Icon: 16×16px, `$space-2` (8px) right margin
- Layout: inline-flex, vertically centered
- Icons inherit tab state text color

## Tabs with Count Badge

- Count pill: right of label, 16px height min, `$radius-full`
- Active state: white bg, `var(--color-brand)` text
- Inactive state: `var(--color-border-strong)` bg, `var(--color-text-secondary)` text

## CRM Tab Contexts

| Page | Tab labels |
|---|---|
| Project detail | Overview · Tasks · Documents · Time · Notes |
| Client detail | Summary · Projects · Invoices · Contacts |
| Invoice | Details · Line Items · Payments · History |
| Analytics | Revenue · Jobs · Team · Time |
