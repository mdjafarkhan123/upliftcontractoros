# Layout Patterns

This is desktop-first software — most contractors running this CRM will have
it open on a monitor most of the day — but it still needs to hold together on
a tablet and, in a pinch, a phone. Build the desktop layout as the default
rule set, then carve out exceptions inside `max-width` queries. Don't build
mobile-first and scale up; it inverts the priority and tends to starve the
desktop layout of the breathing room this whole system depends on.

These are page-level compositions, so unlike `components.md`, this is the
territory of **scoped styles** inside each route's `+page.svelte` (or a
shared `+layout.svelte` for the app shell). Reach for the BEM blocks from
`components.md` for the pieces inside each layout; write the grid/positioning
glue here, locally.

---

## App Shell

The shell wraps every authenticated route: fixed sidebar + sticky topbar +
fluid content area. Lives in `src/routes/(app)/+layout.svelte`.

```scss
.app-shell {
  display: grid;
  grid-template-columns: 280px 1fr;
  min-height: 100vh;
  background: var(--color-bg-app);

  &__main {
    display: flex;
    flex-direction: column;
    padding: $space-6 $space-8;
    gap: $space-6;
    min-width: 0; // prevents kanban/table overflow from blowing out the grid
  }
}

@media (max-width: $bp-tablet) {
  .app-shell {
    grid-template-columns: 72px 1fr; // sidebar collapses to icon-only

    &__main { padding: $space-5; }
  }
}

@media (max-width: $bp-mobile) {
  .app-shell {
    grid-template-columns: 1fr; // sidebar becomes an off-canvas drawer, see below
  }
}
```

**Sidebar collapse behavior:**
- **≥1025px** — full sidebar (280px, icon + label, as specced in `components.md`).
- **641–1024px** — primary sidebar narrows to icon-only (72px, use `.sidebar--icon-only`), still bound to the normal light/dark surface tokens. Labels move into tooltips on hover. (Don't reach for `.sidebar--compact` here — that's a separate, permanently-dark rail style, not the responsive state of the main nav. See `components.md`.)
- **≤640px** — sidebar becomes a Bits UI `Dialog`-based drawer triggered by a hamburger button in the topbar, sliding in from the left over the content (not pushing it).

---

## Dashboard Grid

Reference: the dashboard screenshot's stat row (4 equal tiles, one of them
the dark hero card) → analytics/reminders/project-list row (uneven 2:1:1.5-ish
split) → collaboration/progress/time-tracker row.

```scss
.dashboard-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: $space-5;

  &__row--analytics {
    grid-column: 1 / -1;
    display: grid;
    grid-template-columns: 2fr 1.4fr 1.6fr;
    gap: $space-5;
  }

  &__row--collab {
    grid-column: 1 / -1;
    display: grid;
    grid-template-columns: 1.6fr 1.2fr 1.2fr;
    gap: $space-5;
  }
}

@media (max-width: $bp-tablet) {
  .dashboard-grid {
    grid-template-columns: repeat(2, 1fr); // stat tiles: 4 → 2 per row

    &__row--analytics,
    &__row--collab {
      grid-template-columns: 1fr; // stacked, one card per row
    }
  }
}

@media (max-width: $bp-mobile) {
  .dashboard-grid { grid-template-columns: 1fr; } // stat tiles: 1 per row
}
```

Keep exactly **one** `.card--hero` per dashboard view (the dark accent
tile). It's a focal point because it's rare — turning every stat tile dark
flattens the hierarchy the reference is built around.

---

## Kanban / Pipeline Board Page

Reference: F·H·R's pipeline view — a page header (back link, title, status
badge, action buttons) sitting above a horizontally-scrolling row of fixed-
width columns.

```scss
.pipeline-page {
  display: flex;
  flex-direction: column;
  gap: $space-6;
  height: 100%;
  min-height: 0;

  &__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  &__board {
    flex: 1;
    min-height: 0; // lets .pipeline (in components.md) own its own scroll
  }
}
```

Below `$bp-mobile`, let columns go full-width and swipeable one-at-a-time
(`scroll-snap-type: x mandatory` on `.pipeline`, `scroll-snap-align: start`
on `.pipeline-column`) rather than trying to shrink column width — a 320px
column squeezed into a 375px phone screen has no room left for content.

---

## List / Table Page

A filter/search bar row sits above a single `.card` that wraps the
`.data-table`. Keep the table's own card padding tighter than a content
card's (`$space-4` instead of `$space-6`) since the table rows already
provide internal rhythm.

```scss
.table-page {
  display: flex;
  flex-direction: column;
  gap: $space-5;

  &__toolbar {
    display: flex;
    align-items: center;
    gap: $space-3;
  }

  &__card {
    @extend .card;
    padding: $space-4;
  }
}
```

Below `$bp-tablet`, switch the table to a stacked card-per-row pattern
instead of trying to horizontally scroll a data table — scrolling tables on
touch devices is a common source of frustration, and this system already has
a card component built for exactly this kind of content.

---

## Quick checklist for any new page

1. Does it sit inside `.app-shell__main`? Don't reinvent the sidebar/topbar.
2. Is there at most one `.card--hero` on screen?
3. Are status/stage indicators using `.badge` or the pipeline `__divider`
   modifiers — not one-off colors?
4. Have you written the responsive collapse for tablet AND mobile, even if
   the primary user is on desktop? (Sidebar collapse and table→card collapse
   are the two that get forgotten most often.)
5. Did the grid/positioning code go in a scoped `<style>` block in the page
   itself, with only block/element class names from `components.md` reused
   from global styles?
