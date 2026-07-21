# Data Display

> CRM-specific. Dependencies: `cards.md`, `colors.md`, `typography.md`, `status-indicators.md`

Data display components visualize project analytics, time tracking, revenue, and team performance. All charts live inside card wrappers from `cards.md`.

---

## Bar Chart (Project Analytics / Weekly Activity)

### Layout
- Card wrapper: `@include card-base`, full padding 20px
- Chart header: card heading (16px semibold) + optional period selector (button-group or select)
- Chart area: flex row of bars, aligned to baseline, equal width columns

### Bar Specs
- Bar width: flexible (fill column width), min 24px, max 48px
- Bar radius: 6px top only (`border-radius: 6px 6px 0 0`)
- Gap between bars: 8px
- Max bar height: 160px
- Column labels below: 12px, `var(--body)`, centered

### Bar States / Fill Types

| State | Fill | Pattern |
|---|---|---|
| Completed | `var(--brand)` solid | Solid fill |
| In Progress | `var(--brand-light)` solid | Solid, lighter |
| Pending / Planned | `var(--border-default)` | Diagonal stripe pattern |
| Active / Today | `var(--brand)` | Taller + tooltip on hover |

**Diagonal stripe pattern (pending bars):**
```scss
background: repeating-linear-gradient(
  -45deg,
  var(--border-default),
  var(--border-default) 2px,
  transparent 2px,
  transparent 8px
);
```

### Hover State
- Bar hover: 0.85 opacity, cursor pointer
- Tooltip (dark): shows value + label on hover

### Value Label
- Shown above tallest bar or hovered bar
- Font: 12px, medium, `var(--heading)`
- Position: absolute, centered above bar

---

## Donut / Gauge Chart (Project Progress)

### Half-Donut Gauge (Progress %)
Used for "Project Progress" / "Project Ended" metric.

- SVG arc, half circle (180deg sweep)
- Track: `var(--border-default)`, 12px stroke, round cap
- Fill: `var(--brand)`, 12px stroke, round cap, animated via `stroke-dashoffset`
- Container: 180px × 100px (half circle visible)

### Value inside gauge
- Large %: 30px, semibold, `var(--heading)`, centered below arc
- Label below: 14px, `var(--body)`, e.g. "Project Ended"

### Full Donut
- Full 360deg circle
- Track: `var(--border-default-medium)`, 8px stroke
- Fill segments: use status colors (`var(--brand)`, `var(--warning)`, `var(--border-default)`)
- Legend: horizontal pill badges below, gap 12px

### Legend Item
- 8×8px `$radius-full` colored dot + label text 13px `var(--body)`
- 16px gap between legend items

---

## Progress Bar (Linear)

### Standard
- Height: 8px, `$radius-full`
- Track: `var(--neutral-quaternary)` background
- Fill: `var(--brand)` background
- Radius: `$radius-full`
- Transition: width 400ms ease

### Multi-segment Progress Bar
Used for invoice payment breakdown (Paid / Outstanding / Overdue):
- Height: 8px, `$radius-full` on outer wrapper
- Segments: flex row, proportional widths
- Colors: `var(--brand)` / `var(--warning)` / `var(--danger)` respectively
- First segment: `$radius-full` left; last: `$radius-full` right

### With Label
- Flex row: label (left, 14px body) + percentage (right, 14px semibold heading)
- Progress bar below, 6px margin top

---

## Time Tracker Widget

A dark card (see `cards.md` — Dark Card variant) containing the live timer.

```
┌──────────────────────────────────────┐  ← dark bg
│  Time Tracker          [Status dot] │
│                                      │
│        01:24:08                      │  ← Large mono timer
│                                      │
│    [⏸ Pause]   [⏹ Stop]            │  ← Icon buttons
└──────────────────────────────────────┘
```

- **Timer text:** 36px, semibold, white, monospace (`font-variant-numeric: tabular-nums`)
- **Card background:** `var(--dark-strong)` → very dark green
- **Status dot:** pulsing green (see `status-indicators.md` — Time Tracking Status)
- **Control buttons:** circular, 40×40px, `$radius-full`
  - Pause: white bg, `var(--dark-strong)` icon
  - Stop: `var(--danger)` bg, white icon
- **Header:** "Time Tracker" 14px medium, `rgba(255,255,255,0.70)`

---

## Activity Feed / Timeline

Used in project history, invoice activity, client notes.

```
  ● ─── Completed phase 1                 Nov 26
  │
  ● ─── Invoice #042 sent to client       Nov 24
  │
  ● ─── Team member assigned              Nov 22
```

- Left column: 20px wide, continuous 1px vertical `var(--border-default)` line
- Dot: 10×10px `$radius-full`, `var(--brand-soft)` border 2px + `var(--brand)` fill for brand events
- Content: flex row — description (14px `var(--body)`) + date (12px `var(--body-subtle)`, right-aligned)
- Gap between items: 20px
- Last item: no bottom border on connector line

---

## Rules

- All chart containers use `@include card-base` (white/dark bg, 8px radius, shadow-xs, border)
- No raw hex in chart colors — use only `var(--brand)`, `var(--brand-light)`, status tokens
- Stripe patterns for pending/planned data only — solid fills for actuals
- All animated values: 400ms ease transitions
- Hover states on all interactive chart elements (bars, slices)
- Always include a text legend alongside any chart for accessibility
- Timer display uses tabular-nums for stable digit widths
