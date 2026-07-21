# Alerts

> Dependencies: `colors.md`, `radius.md`

## Core Specs

- **Padding:** 16px
- **Radius:** 8px (`$radius-base`)
- **Border:** 1px
- **Heading:** 16px, medium (500)
- **Body:** 14px, normal, 1.6 line-height
- **Layout:** flex row, 12px gap between icon and content

## Variants

### Brand (Info / Announcement)
- **Background:** `var(--brand-softer)`
- **Border:** `var(--border-brand-subtle)`
- **Text / Icon:** `var(--fg-brand-strong)`

### Success
- **Background:** `var(--success-soft)`
- **Border:** `var(--border-success-subtle)`
- **Text / Icon:** `var(--fg-success-strong)`

### Danger / Error
- **Background:** `var(--danger-soft)`
- **Border:** `var(--border-danger-subtle)`
- **Text / Icon:** `var(--fg-danger-strong)`

### Warning
- **Background:** `var(--warning-soft)`
- **Border:** `var(--border-warning-subtle)`
- **Text / Icon:** `var(--fg-warning)`

### Info (Blue)
- **Background:** `var(--info-soft)`
- **Border:** `var(--border-info-subtle)`
- **Text / Icon:** `var(--fg-info)`

## Anatomy

- **Icon:** 20×20px, left-aligned, matches text color
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
