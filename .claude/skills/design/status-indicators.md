# Status Indicators

> CRM-specific. Dependencies: `colors.md`, `badges.md`, `radius.md`

Status indicators are the visual language for job, project, invoice, and team entity states across the Contractor CRM. All statuses use pill badges (`$radius-full`) at default size (12px, 6px/2px padding).

---

## Job / Project Statuses

| Status | Background token | Border token | Text token | Dot color |
|---|---|---|---|---|
| Draft | `var(--color-bg-surface-sunk)` | `var(--color-border)` | `var(--color-text-secondary)` | `var(--color-text-muted)` |
| Active | `var(--state-active-tint)` | `var(--color-brand)` | `var(--color-brand-strong)` | `var(--color-brand)` |
| In Progress | `var(--info-bg)` | `var(--info-solid)` | `var(--info-text)` | `var(--info-solid)` |
| On Hold | `var(--warning-bg)` | `var(--warning-solid)` | `var(--warning-text)` | `var(--warning-solid)` |
| Completed | `var(--success-bg)` | `var(--success-solid)` | `var(--success-solid)` | `var(--success-solid)` |
| Cancelled | `var(--danger-bg)` | `var(--danger-solid)` | `var(--danger-solid)` | `var(--danger-solid)` |
| Archived | `var(--color-bg-surface-sunk)` | `var(--color-border)` | `var(--color-text-muted)` | `var(--color-text-muted)` |

### Status Dot

A `$space-2`×`$space-2` (8×8px) `$radius-full` circle of the dot color sits to the left of the status label inside the badge:
```
● Active     ● In Progress     ● Completed
```

---

## Invoice Statuses

| Status | Token set |
|---|---|
| Draft | Gray (neutral) |
| Sent | Info (blue) |
| Viewed | Brand (green) |
| Partially Paid | Warning |
| Paid | Success |
| Overdue | Danger |
| Void | Gray disabled |

---

## Priority Indicators

Used in task lists, project cards, and table rows.

| Priority | Color | Icon |
|---|---|---|
| Low | `var(--color-text-secondary)` | down-arrow or none |
| Medium | `var(--warning-text)` | minus / equal |
| High | `var(--danger-text)` | up-arrow |
| Urgent | `var(--danger-solid)` (bg pill) | double-up-arrow |

### Priority Badge
Same size as status badge. Urgent: danger variant pill. High/Medium/Low: icon-only or colored text, no background.

---

## Pipeline / Stage Indicator (Horizontal Stepper)

Used on Project detail and Invoice flow views.

```
  ①─────②─────③─────④─────⑤
 Lead  Quote  Won  Active  Done
```

- Step circle: `$space-7`×`$space-7` (28×28px), `$radius-full`
- Complete step: `var(--color-brand)` bg, white checkmark, 1px `var(--color-brand)` border
- Active step: white bg, `var(--color-brand)` border 2px, `var(--color-brand)` number
- Upcoming step: `var(--color-bg-surface-sunk)` bg, `var(--color-text-secondary)` border, `var(--color-text-secondary)` number
- Connector line: 2px, complete → `var(--color-brand)`, incomplete → `var(--color-border)`
- Label below: 12px, medium, matching text color

---

## Time Tracking Status

| State | Indicator |
|---|---|
| Not started | Gray dot |
| Running (active) | Pulsing green dot + live timer |
| Paused | Amber dot + paused timer |
| Completed | Checkmark, `var(--success-text)` |

**Pulsing dot (running):**
```scss
.status-dot--running {
  background: var(--color-brand);
  animation: pulse 1.5s ease-in-out infinite;
}
@keyframes pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(var(--color-brand-rgb), 0.5); }
  50%       { box-shadow: 0 0 0 6px rgba(var(--color-brand-rgb), 0); }
}
```

---

## Completion / Progress Ring

Used in project cards and dashboard progress panel.

- Ring: SVG circle, `stroke-dashoffset` driven by progress %
- Track: `var(--color-border)` stroke, 4px width
- Fill: `var(--color-brand)` stroke, 4px width, `stroke-linecap: round`
- Label inside: percentage in 20px semibold `var(--color-text-primary)`, subtext 12px `var(--color-text-secondary)`

---

## Rules

- Always use pill shape (`$radius-full`) for inline status badges
- Never use raw colors for status — always use the token pairs from this file
- Status dot is always left of label text within the badge
- Priority must never be the same visual style as job status (use different shapes or icons)
- Overdue invoices must always use the Danger variant — never Warning
