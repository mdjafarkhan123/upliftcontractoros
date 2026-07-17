# Visual Reference Notes

`assets/reference-dashboard.webp` and `assets/reference-pipeline.webp` are
the actual ground truth — **view them directly** before building any screen
that isn't already specced in `components.md`. This file is a annotated
index into them, useful for quickly recalling which element maps to which
token, and for reasoning about anything genuinely new.

## reference-dashboard.webp — "Donezo" project dashboard

This is the primary visual reference for the CRM's overall feel: a project
management dashboard, green brand, soft elevated cards. Most of this CRM
should look like this screenshot's design language applied to contractor
data (jobs, clients, quotes) instead of projects/tasks.

| Element in screenshot                    | Token(s) it maps to                                                                                                                                                                                                                                         |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Page background (light gray)             | `var(--color-bg-app)`                                                                                                                                                                                                                                       |
| White cards, sidebar, topbar             | `var(--color-bg-surface)`                                                                                                                                                                                                                                   |
| Card corner rounding (very round)        | `$radius-2xl`                                                                                                                                                                                                                                               |
| "Total Projects" dark green tile         | `var(--color-brand-strong)` fill, `var(--shadow-glow)`, `.card--hero`                                                                                                                                                                                       |
| Big stat numbers ("24", "12")            | `$text-stat` / `$font-display` / `$weight-bold`                                                                                                                                                                                                             |
| "Increased from last month" trend chip   | `.trend-chip`, `var(--success-bg)`/`var(--success-text)`                                                                                                                                                                                                    |
| Sidebar active item (Dashboard)          | `.sidebar__nav-item--active` — left bar + bold text, not a full highlight fill                                                                                                                                                                              |
| "MENU" / "GENERAL" section labels        | `.eyebrow`                                                                                                                                                                                                                                                  |
| Search bar with `⌘F` hint                | `.topbar__search`, `$radius-full`, `var(--color-bg-surface-sunk)`                                                                                                                                                                                           |
| "Completed / In Progress / Pending" tags | `.badge--success` / `.badge--warning` (the third tag reads closer to a soft red — treat as `.badge--danger` for a "Pending"/blocked-style status if your CRM needs that nuance, or `.badge--warning` if "pending" should feel neutral rather than alarming) |
| Weekly capsule bar chart                 | `.capsule-bar`, rounded ends, hatched/diagonal pattern for empty future days — render the hatch as a subtle repeating-linear-gradient stripe in `var(--color-border)` over `var(--color-bg-surface-sunk)`, not a separate token                             |
| "41% Project Ended" donut                | SVG arc gauge, see Progress & Gauges in `components.md`                                                                                                                                                                                                     |
| Time Tracker card                        | second `.card--hero` instance — note the reference uses it as the _second_ dark card, which works because it's visually distinct (timer digits, not a stat number) from the first; don't add a third                                                        |
| Avatars                                  | `.avatar`, circular, colorful illustrated style — for a contractor CRM use real client/crew photos or `.avatar--fallback` initials, not illustrated avatars                                                                                                 |

## reference-pipeline.webp — "F·H·R" recruitment pipeline

Secondary reference, almost entirely for _structure_ rather than color — this
screenshot is blue-branded, but the CRM should render this exact layout
pattern in the green system. Use this as the template for any job/lead
pipeline, quote pipeline, or deal-stage board.

| Element in screenshot                                  | Token(s) it maps to                                                                                                                                                                                 |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Slim icon-only left rail                               | `.sidebar--compact` (optional secondary rail, not the primary nav)                                                                                                                                  |
| Column header + "X REJECTED Y TOTAL" row               | `.pipeline-column__stats`                                                                                                                                                                           |
| Colored divider line per column                        | `.pipeline-column__divider--*` — reassign the 4 stage colors to whatever stages this CRM actually has (don't keep "Applied/Shortlisted/Interview/Evaluation" naming, that's specific to recruiting) |
| Candidate card (avatar, name, location, rating, phone) | `.pipeline-card` — for a contractor CRM this becomes client/job name, address, job value or priority instead of a star rating, and phone stays as-is                                                |
| "New" soft blue tag                                    | `.badge--info`                                                                                                                                                                                      |
| "Followed" solid blue tag                              | `.badge--info.badge--solid`                                                                                                                                                                         |
| Floating mini chart bottom-right                       | optional — a small floating insights widget is a nice touch for a busy pipeline view, but it's decoration, not a core pattern; don't force it into every screen                                     |

## A note on dark mode

Both reference screenshots are light-mode only — there's no dark screenshot
to trace. That's fine: the token table above maps screenshot elements to
_semantic_ tokens (`var(--color-bg-app)`, `.badge--success`, etc.), and
those tokens already carry their own dark-mode values in `tokens.scss`. As
long as a new component is built against the semantic tokens rather than a
color picked straight off the screenshot, it inherits dark mode for free.
The handful of places that needed a genuinely different (not just inverted)
treatment in dark mode — the hero card gradient, status badge contrast
direction, avatar fallback colors — are called out explicitly in
`tokens.scss`'s `dark-theme-tokens` mixin and in `components.md`.

## What to do when a screen isn't covered here

Most new screens are a recombination of pieces already specced. Before
inventing something new:

1. Check `components.md` for the closest existing block.
2. Check whether `reference-dashboard.webp` or `reference-pipeline.webp` has
   an analogous element, even in a different context (e.g. a settings page
   toggle isn't pictured, but Bits UI's `Switch` styled with brand-green for
   the "on" state and `$slate-300` for "off" is consistent with everything
   else here).
3. Only design something genuinely new if neither applies — and when you do,
   stay inside the existing token set rather than picking a fresh color or
   radius value.
