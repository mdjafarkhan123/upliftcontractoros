# Status Indicators

> CRM-specific. Dependencies: `colors.md`, `badges.md`, `radius.md`

Status indicators are the visual language for job, project, invoice, and team entity states across the Contractor CRM. All statuses use pill badges (`$radius-full`) at default size (12px, 6px/2px padding).

---

## Job / Project Statuses

| Status | Background token | Border token | Text token | Dot color |
|---|---|---|---|---|
| Draft | `neutral-secondary-medium` | `border-default` | `body` | `gray` |
| Active | `brand-softer` | `border-brand-subtle` | `fg-brand-strong` | `brand` |
| In Progress | `info-soft` | `border-info-subtle` | `fg-info` | `info` |
| On Hold | `warning-soft` | `border-warning-subtle` | `fg-warning` | `warning` |
| Completed | `success-soft` | `border-success-subtle` | `fg-success-strong` | `success` |
| Cancelled | `danger-soft` | `border-danger-subtle` | `fg-danger-strong` | `danger` |
| Archived | `neutral-tertiary-soft` | `border-default` | `fg-disabled` | `gray` |

### Status Dot

A 8×8px `$radius-full` circle of the dot color sits to the left of the status label inside the badge:
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
| Low | `body` | down-arrow or none |
| Medium | `fg-warning` | minus / equal |
| High | `fg-danger` | up-arrow |
| Urgent | `danger` (bg pill) | double-up-arrow |

### Priority Badge
Same size as status badge. Urgent: danger variant pill. High/Medium/Low: icon-only or colored text, no background.

---

## Pipeline / Stage Indicator (Horizontal Stepper)

Used on Project detail and Invoice flow views.

```
  ①─────②─────③─────④─────⑤
 Lead  Quote  Won  Active  Done
```

- Step circle: 28×28px, `$radius-full`
- Complete step: `var(--brand)` bg, white checkmark, 1px `var(--brand)` border
- Active step: white bg, `var(--brand)` border 2px, `var(--fg-brand)` number
- Upcoming step: `var(--neutral-tertiary)` bg, `var(--body)` border, `var(--body)` number
- Connector line: 2px, complete → `var(--border-brand)`, incomplete → `var(--border-default)`
- Label below: 12px, medium, matching text color

---

## Time Tracking Status

| State | Indicator |
|---|---|
| Not started | Gray dot |
| Running (active) | Pulsing green dot + live timer |
| Paused | Amber dot + paused timer |
| Completed | Checkmark, `fg-success` |

**Pulsing dot (running):**
```scss
.status-dot--running {
  background: var(--brand);
  animation: pulse 1.5s ease-in-out infinite;
}
@keyframes pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(34,125,83, 0.5); }
  50%       { box-shadow: 0 0 0 6px rgba(34,125,83, 0); }
}
```

---

## Completion / Progress Ring

Used in project cards and dashboard progress panel.

- Ring: SVG circle, `stroke-dashoffset` driven by progress %
- Track: `var(--border-default)` stroke, 4px width
- Fill: `var(--brand)` stroke, 4px width, `stroke-linecap: round`
- Label inside: percentage in 20px semibold `var(--heading)`, subtext 12px `var(--body)`

---

## Rules

- Always use pill shape (`$radius-full`) for inline status badges
- Never use raw colors for status — always use the token pairs from this file
- Status dot is always left of label text within the badge
- Priority must never be the same visual style as job status (use different shapes or icons)
- Overdue invoices must always use the Danger variant — never Warning
