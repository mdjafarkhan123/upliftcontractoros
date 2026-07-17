# Schedule Week Grid — UX Improvements (Session Memory)

**Project:** ContractorOs (SvelteKit 5 runes, Tailwind-free, BEM SCSS + Bits UI).
**Last updated:** 2026-07-16
**Status:** Most improvements DONE. One desktop item (#4 overflow cue) remains open. Mobile-specific items intentionally deferred — a separate native mobile app is planned, desktop web is the priority.

---

## Context (user decisions this session)

- **Scope:** Desktop web app is the priority. Mobile will be a SEPARATE native app build later — do NOT optimize the web calendar for phones/tablets-in-browser. The week grid is already hidden below `$bp-tablet` (stacked `CalendarDayList` takes over on phones).
- The Schedule week grid component (`src/lib/components/appointments/CalendarWeekGrid.svelte`) was reviewed and judged **NOT in need of a rewrite** — it already implements strong industry patterns (Jobber/Housecall-style Anytime lane, drag-to-create, optimistic drag-reschedule with confirm→notify, visit/event split, now-line, sticky headers, DST-safe org-timezone math). Work was targeted additive improvements only.

## What is DONE

1. **Off-hours banding + Business-hours caption** — off-hours rows now use a subtle diagonal hatch band (theme-aware) instead of a flat fill; a sticky "8 AM–5 PM"-style caption renders in the time-rail gutter via `i18nRange()` helper. Makes the working window readable at a glance.
2. **Dark-mode-safe contrast** — replaced hardcoded `rgba(34,125,83,…)` greens (invisible in dark mode) with new theme tokens `--brand-tint-strong` / `--brand-tint-solid` / `--brand-glow-soft` (added to `src/lib/styles/_tokens.scss` for both `:root` and the `dark-theme-tokens` mixin). Off-hours rail labels had their `opacity:0.6` removed so they're legible. Today-column tint switched from hardcoded green to `--state-active-tint`.
3. **Anytime-lane drop hint** — empty Anytime cells show a "Drop for all-day" dashed hint on hover (CSS `:has()` selector; degrades gracefully if unsupported).
4. **Density toggle (Compact / Comfortable / Spacious)** — full feature:
   - Type `CalendarDensity = 'compact' | 'comfortable' | 'spacious'` added to `src/lib/types/appointments.ts`.
   - New store `src/lib/stores/calendarDensity.svelte.ts` (mirrors `theme.svelte.ts`: `browser` guard + `localStorage` key `cos-cal-density`, default `comfortable`). Exports `DENSITY_HOUR_HEIGHT` map (40 / 56 / 72 px).
   - `CalendarWeekGrid.svelte`: `HOUR_HEIGHT` is now `$derived` from a `density` prop; density-aware card reveal thresholds (`SHOW_PILL_MIN` / `SHOW_META_MIN` / `SHOW_AVATAR_MIN`); root gets `cal-week--{density}` BEM modifier.
   - `CalendarHeader.svelte`: three-icon zoom segmented control (collapse / equalizer / expand remix icons), shown only in calendar view + non-month range, calls `onDensityChange`.
   - `appointments/+page.svelte`: wires `calendarDensity.value` to header + grid.
   - `src/lib/styles/components/_appointments.scss`: `cal-week--compact` / `--spacious` modifiers tune card padding/font-size.
   - **Bug fixed:** `density` was declared in the prop TYPE but not added to the destructured `let {…}` binding → caused `Uncaught ReferenceError: density is not defined` at runtime. Fixed by adding `density = 'comfortable'` to the binding.

## Remaining (open)

- **#4 End-of-day overflow cue** — when a day's content exceeds the visible viewport height, there's no "more below" indicator; the scroll is silent. Small desktop polish. Not yet built.
- **#2 Min column width + horizontal scroll** — DEFERRED (desktop-only app; squishing only matters on small/tablet screens which the separate mobile app covers).
- **#3 Touch-reachable inline actions** — DEFERRED to the mobile app (desktop uses mouse hover; `:has`/opacity-0 actions unreachable on touch, but detail popover covers it).

## How to verify / pick up

- Build: `npx vite build --mode development` (if it errors on a stale `.svelte-kit/output` artifact, `Remove-Item -Recurse -Force .svelte-kit\output` then rebuild).
- SCSS: `npx sass src/lib/styles/components/_appointments.scss` (must exit 0).
- `svelte-check` shows pre-existing `supabase.ts` "need to install supabase" noise unrelated to this work — ignore.
- Key files: `src/lib/components/appointments/CalendarWeekGrid.svelte`, `CalendarHeader.svelte`, `src/routes/(app)/(pages)/appointments/+page.svelte`, `src/lib/stores/calendarDensity.svelte.ts`, `src/lib/types/appointments.ts`, `src/lib/styles/components/_appointments.scss`, `src/lib/styles/_tokens.scss`.
- Note: when adding a prop, add it to BOTH the destructured `let {…}` binding AND the type block — missing either causes a runtime `ReferenceError` (this burned us once).
