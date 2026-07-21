# Content & Grid System

> Dependencies: `layout.md`, `typography.md`

## Containers

| Type                       | Max width  | Horizontal padding |
| -------------------------- | ---------- | ------------------ |
| App content (with sidebar) | Full width | 24–32px            |
| Reading / forms            | 640px      | —                  |
| Narrow (confirm dialogs)   | 480px      | —                  |

## Grid System

Mobile-first flexible grid.

| Context | Gap | Columns (mobile → desktop) |
|---|---|---|
| KPI stat cards | 16px → 24px | 2 → 4 |
| Dashboard panels | 24px | 1 → 2 → 3 |
| Compact widgets | 16px | variable |
| Full-width sections | 0 | 1 |

## Dashboard Layout Grid

Recommended grid for the main dashboard:

```
┌──────────┬──────────┬──────────┬──────────┐
│ Stat KPI │ Stat KPI │ Stat KPI │ Stat KPI │  Row 1: 4 cols (featured + 3 standard)
├──────────┴──────┬───┴──────────┼──────────┤
│ Analytics Chart │  Reminders  │ Projects │  Row 2: 2/3 + 1/3 + 1/3
│    (2 cols)     │  (1 col)    │ (1 col)  │
├─────────────────┴──────────────┼──────────┤
│ Team Collab (1.5 cols)         │ Progress │  Row 3: 1.5 + 1 + ...
│                                │ + Timer  │
└────────────────────────────────┴──────────┘
```

## Vertical Padding by Breakpoint

| Breakpoint | Page padding |
|---|---|
| Mobile | 16px |
| Tablet (≥768px) | 24px |
| Desktop (≥1024px) | 32px |

## Breakpoints

| Name | Width |
|---|---|
| Small | 640px |
| Medium | 768px |
| Large | 1024px |
| Extra large | 1280px |
| 2XL | 1536px |

## Rules

- Always design Desktop-first
- Use layout shifts (stack → row) at md and lg breakpoints
- Lists: 24px indentation, 8px vertical item gap
- Body copy: 16px, 1.7 line-height, max-width 65ch
- Interactive links: `var(--color-brand)` color, underline, hover → no underline
- All interactive links follow brand underline/hover protocol
