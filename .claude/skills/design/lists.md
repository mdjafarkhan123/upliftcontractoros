# Lists

> Dependencies: `colors.md`

## Core Specs

- Item spacing: 16px vertical gap between items
- Text: `var(--color-text-secondary)` color

## List Icons

- Size: `$space-5`×`$space-5` (20×20px)
- Prevent squishing: flex-shrink: 0
- Spacing: `$space-2` (8px) right margin between icon and text
- Active / featured icon: `var(--color-brand)` color
- Neutral icon: `var(--color-text-secondary)` color

## Team Member List (CRM — Collaboration Panel)

Used in the Team Collaboration widget on the dashboard:
- Item layout: flex row, `$space-3` (12px) gap
- Avatar: 36×36px, `$radius-full`
- Content: flex column — name (`$fs-body`, medium, `var(--color-text-primary)`) + task description (`$fs-caption` ~13px, `var(--color-text-secondary)`)
- Task text: "Working on" prefix in body color, task name in `var(--color-text-primary)`, medium
- Status badge: right-aligned, pill variant
- Bottom border: 1px `var(--color-border)` on all except last

## Project Task List (CRM — Sidebar Projects Panel)

- Item layout: flex row, `$space-2` (10px) gap
- Icon: 20×20px colored project icon (use assigned color per project)
- Content: flex column — task name (14px, medium, `var(--color-text-primary)`) + due date (`$fs-caption` (12px), `var(--color-text-muted)`)
- No border between items; 12px vertical gap

## Inactive / Disabled Items

Strikethrough text with `var(--color-text-secondary)` decoration on the list item.

## Checklist Items (CRM — Job Tasks)

- Checkbox: 16×16px, `$radius-xs` (4px)
- Label: 14px, `var(--color-text-secondary)` when unchecked → `var(--color-text-muted)` + line-through when checked
- Gap: 10px between checkbox and label
- 12px vertical gap between items
