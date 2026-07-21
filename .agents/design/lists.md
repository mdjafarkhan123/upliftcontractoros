# Lists

> Dependencies: `colors.md`

## Core Specs

- Item spacing: 16px vertical gap between items
- Text: `var(--body)` color

## List Icons

- Size: 20×20px
- Prevent squishing: flex-shrink: 0
- Spacing: 8px right margin between icon and text
- Active / featured icon: `var(--fg-brand)` color
- Neutral icon: `var(--body)` color

## Team Member List (CRM — Collaboration Panel)

Used in the Team Collaboration widget on the dashboard:
- Item layout: flex row, 12px gap
- Avatar: 36×36px, `$radius-full`
- Content: flex column — name (14px, medium, `var(--heading)`) + task description (13px, `var(--body)`)
- Task text: "Working on" prefix in body color, task name in `var(--heading)`, medium
- Status badge: right-aligned, pill variant
- Bottom border: 1px `var(--border-default)` on all except last

## Project Task List (CRM — Sidebar Projects Panel)

- Item layout: flex row, 10px gap
- Icon: 20×20px colored project icon (use assigned color per project)
- Content: flex column — task name (14px, medium, `var(--heading)`) + due date (12px, `var(--body-subtle)`)
- No border between items; 12px vertical gap

## Inactive / Disabled Items

Strikethrough text with `var(--body)` decoration on the list item.

## Checklist Items (CRM — Job Tasks)

- Checkbox: 16×16px, `$radius-sm` (4px)
- Label: 14px, `var(--body)` when unchecked → `var(--fg-disabled)` + line-through when checked
- Gap: 10px between checkbox and label
- 12px vertical gap between items
