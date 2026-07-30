# Alerts

> Dependencies: `colors.md`, `radius.md`

## Core Specs

- **Padding:** 16px
- **Radius:** 8px (`$radius-sm`)
- **Border:** 1px
- **Heading:** `$fs-lg`/`var(--text-lg)` (16px), medium (500)
- **Body:** 14px, normal, 1.6 line-height
- **Layout:** flex row, 12px gap between icon and content

## Variants

### Brand (Info / Announcement)
- **Background:** `var(--state-active-tint)`
- **Border:** `var(--color-brand)`
- **Text / Icon:** `var(--color-brand-strong)`

### Success
- **Background:** `var(--success-bg)`
- **Border:** `var(--success-solid)`
- **Text / Icon:** `var(--success-solid)`

### Danger / Error
- **Background:** `var(--danger-bg)`
- **Border:** `var(--danger-solid)`
- **Text / Icon:** `var(--danger-solid)`

### Warning
- **Background:** `var(--warning-bg)`
- **Border:** `var(--warning-solid)`
- **Text / Icon:** `var(--warning-text)`

### Info (Blue)
- **Background:** `var(--info-bg)`
- **Border:** `var(--info-solid)`
- **Text / Icon:** `var(--info-text)`

## Anatomy

- **Icon:** 20×20px (`$space-5`), left-aligned, matches text color
- **Content:** flex column — heading (optional) + body text
- **Close button (optional):** ghost button, right-aligned, 20×20px icon

## CRM Alert Usage

| Situation | Variant |
|---|---|
| Invoice overdue reminder | Warning |
| Job completed successfully | Success |
| Payment failed / error | Danger |
| New feature announcement | Brand |
| Permit expiry reminder | Warning |
| Contract pending signature | Info |
