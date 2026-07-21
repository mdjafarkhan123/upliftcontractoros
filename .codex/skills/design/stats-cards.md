# Stats Cards

> CRM-specific. Dependencies: `cards.md`, `colors.md`, `typography.md`, `badges.md`

Stats cards (KPI cards) appear in the dashboard header row and on module summary pages. They display a primary metric, trend indicator, and optional supporting context.

---

## Anatomy

```
┌─────────────────────────────────────────┐
│  Label text             [↗ Arrow icon]  │
│                                         │
│  44                                     │  ← Primary value
│                                         │
│  ↑ 8%  Increased from last month       │  ← Trend line
└─────────────────────────────────────────┘
```

---

## Variants

### Standard Stat Card
- Base card styles from `cards.md`
- Padding: 20px
- **Label:** 14px, `var(--color-text-secondary)`, medium
- **Value:** 44px, semibold, `var(--color-text-primary)` *(see Typography — Numeric Data)*
- **Trend:** 13px, medium + icon 14×14px
- **Link icon (↗):** 20×20px ghost button, top-right, `var(--color-text-secondary)` → `var(--color-text-primary)` on hover

### Featured Stat Card (Primary KPI — brand green background)
Use for the most important metric on the page (e.g., Total Projects, Total Revenue).
- Background: `var(--color-brand)` → #227d53 light / #5fbd92 dark
- Border: transparent
- Shadow: `$shadow-sm`
- **Label:** 14px, `rgba(255,255,255,0.80)`, medium
- **Value:** 44px, semibold, white
- **Trend text:** 13px, `rgba(255,255,255,0.80)`
- **Trend icon:** white
- **Link icon:** white, 50% opacity → full on hover

### Compact Stat Card
For tighter grids (e.g., inline summary rows within module pages):
- Padding: 16px
- Value: 24px, semibold, `var(--color-text-primary)`
- Label: 13px, `var(--color-text-secondary)`
- No trend line

### Mini Stat (Inline / Widget)
For sidebar widgets or inline summary bars:
- No card border, no shadow (borderless)
- Value: 20px, semibold, `var(--color-text-primary)`
- Label: 12px, `var(--color-text-muted)`
- Stacked: value on top, label below

---

## Trend Indicator

Shows change vs prior period (last month / last week).

| Direction | Icon | Text color | Icon color |
|---|---|---|---|
| Up positive | ↑ arrow | `var(--success-solid)` | `var(--success-text)` |
| Down negative | ↓ arrow | `var(--danger-solid)` | `var(--danger-text)` |
| Neutral | → arrow | `var(--color-text-secondary)` | `var(--color-text-secondary)` |
| Up negative (cost) | ↑ arrow | `var(--danger-solid)` | `var(--danger-text)` |

Format: `↑ 8% · Increased from last month` or `↓ 3% · 2 fewer than last week`

Trend area:
- Flex row, 4px gap
- Icon + percentage: colored per direction
- Description text: `var(--color-text-secondary)` (or `rgba(255,255,255,0.70)` on featured card)

---

## Dashboard Stats Row Layout

Four stat cards in a row, 24px gap:
- Card 1: **Featured** (brand green bg) — primary metric e.g. Total Jobs
- Cards 2–4: **Standard** — secondary metrics e.g. Active, Completed, Pending

Responsive: 2 columns on tablet, 4 on desktop. Featured card can span 2 cols on mobile.

---

## CRM KPI Examples

| Module | Primary KPI | Secondary KPIs |
|---|---|---|
| Dashboard | Total Projects | Active · Completed · Pending |
| Clients | Total Clients | Active · New This Month · At Risk |
| Invoices | Total Revenue | Outstanding · Overdue · Paid This Month |
| Time Tracking | Total Hours (month) | Billable · Non-Billable · This Week |
| Team | Team Members | Active · Subcontractors · Utilization % |

---

## Rules

- Maximum one Featured card per stats row
- Never use Featured card style for anything other than the primary KPI
- Value text must always be the largest element in the card (44px desktop, 30px mobile)
- Trend direction color must be semantically accurate (up cost = danger, not success)
- Always include aria-label on the link icon describing where it navigates
