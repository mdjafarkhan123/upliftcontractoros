# UI Primitives Registry + The Styling Law

This file exists to stop two recurring, silently-shipping UI bugs:

1. **Native/hand-rolled inputs** slipping in where a built primitive already
   exists (e.g. `<input type="date">` instead of the project `Calendar`).
   Violates CLAUDE.md Rule 4. Compiles clean, looks off-system.
2. **Shared BEM classes authored in a scoped `<style>` block** — Svelte's
   per-component scope hash means the rule only applies to the ONE component
   that declared it. Every other component using the same class renders as a
   bare, unstyled element. Compiles 100% clean, ships broken.

Neither is caught by `npm run check` — `svelte-check` does not compile SCSS,
and a `class=` with no matching rule is zero errors / zero warnings. So the
defense is this registry + the Styling Law below, applied by hand every time.

---

## 1. The Primitive Registry

**Before writing any input, picker, dropdown, or icon: use the built
component. Do not hand-roll or use the native element.** When in doubt about
whether a primitive exists, `grep` `src/lib/components/ui/` FIRST.

| You need…             | Use this built component                                   | Import path                                       | BANNED (never do this)                                                |
| --------------------- | ---------------------------------------------------------- | ------------------------------------------------- | --------------------------------------------------------------------- |
| **Date only**         | `Calendar`                                                 | `$lib/components/ui/calendar`                     | `<input type="date">`                                                 |
| **Date + time**       | `DateTimePicker`                                           | `$lib/components/ui/date-time-picker`             | `<input type="datetime-local">`, separate native date+time inputs     |
| **Time only**         | `DateTimePicker` (or grep `ui/` first for a time-only one) | `$lib/components/ui/date-time-picker`             | `<input type="time">`                                                 |
| **Select / dropdown** | `Select.Root/Trigger/Value/Content/Item`                   | `$lib/components/ui/select`                       | native `<select>`, the legacy `Select` wrapper for new UI             |
| **Text input**        | `Input`                                                    | `$lib/components/ui/input`                        | bare styled `<input>` (unless it's a one-off already-BEM'd field row) |
| **Textarea**          | `Textarea`                                                 | `$lib/components/ui/textarea`                     | bare `<textarea>`                                                     |
| **Menu (row/kebab)**  | `DropdownMenu.*`                                           | `$lib/components/ui/dropdown-menu`                | hand-rolled popover menu                                              |
| **Dialog / modal**    | `Dialog.*`                                                 | `$lib/components/ui/dialog`                       | hand-rolled overlay                                                   |
| **Popover**           | `Popover.*`                                                | `$lib/components/ui/popover`                      | hand-rolled absolute-positioned div                                   |
| **Sheet / drawer**    | `Sheet.*`                                                  | `$lib/components/ui/sheet`                        | —                                                                     |
| **Tabs**              | `Tabs.*`                                                   | `$lib/components/ui/tabs`                         | —                                                                     |
| **Switch / toggle**   | `Switch`                                                   | `$lib/components/ui/switch`                       | `<input type="checkbox">` styled as a toggle                          |
| **Phone number**      | `PhoneField`                                               | `$lib/components/PhoneField.svelte` (verify path) | bare `<input>` for phone — see [[phone-field-industry-upgrade]]       |
| **Icons**             | `<i class="ri-*">` (Remix Icon)                            | global (remixicon CSS)                            | Lucide, any raw inline `<svg>` — see [[feedback-remix-icons]]         |

### Value types (important — this project's pickers use plain strings)

Unlike a stock shadcn/bits calendar, **these components bind to plain
strings, not `@internationalized/date` objects.** No conversion needed at the
store/API boundary:

- `Calendar` — `value` is a `"yyyy-mm-dd"` string (bindable). Optional `min`
  is also a `"yyyy-mm-dd"` string. Emits `''` when cleared.
- `DateTimePicker` — `value` is a `"yyyy-mm-ddTHH:mm"` **local** string
  (bindable). Optional `min` is the same shape; days/times before it are
  disabled (used to keep an end ≥ its start).

So a date-range filter can bind `Calendar` straight to a `yyyy-mm-dd` store
field and pass it to `/api/*?date_from=…` with no adapter.

### Reference usage

- `src/lib/components/jobs/JobScheduleEditor.svelte` — canonical
  `DateTimePicker` usage (start/end, `min` chaining).
- `src/lib/components/ui/calendar/Calendar.svelte` /
  `date-time-picker/DateTimePicker.svelte` — read the `$props()` block for the
  exact API before using.

---

## 2. The Styling Law

> **Any BEM class used by 2 or more components MUST be defined in a global
> partial under `src/lib/styles/components/_*.scss` (forwarded through
> `global.scss`). It must NEVER live in a component's scoped `<style>` block.**

Scoped `<style>` is **only** for classes private to ONE component — a one-page
layout grid, a positioning tweak that composes global blocks. The moment a
second component uses the same class name, the style must be global, or the
second component ships unstyled.

**Why this is invisible without the law:** Svelte adds a per-component hash
(`svelte-abc123`) to every selector in a scoped `<style>`. A class declared in
`ComponentA.svelte`'s scoped block becomes `.job-section__edit.svelte-abc123`
— it will not match the identical `class="job-section__edit"` rendered by
`ComponentB.svelte`. Both compile with zero warnings.

**The test:** _"If I changed this rule, would I expect it to change on every
page/component that uses the class, or just this one?"_
Every → global partial. Just this one → scoped (and confirm the class name
appears in no other file).

### Where global partials live

`src/lib/styles/components/` — one partial per domain/block. Entity/section
styles: `_jobs.scss`, `_quotes.scss`, `_invoices.scss`, `_contacts.scss`,
`_appointments.scss`. Primitives: `_ui-primitives.scss` (holds the
`Calendar`/`DateTimePicker` `cal-pick`/`dtp` styles). Shared blocks:
`_button.scss` (`.btn`), `_badge.scss`, `_card.scss`, `_field.scss`,
`_table.scss`, `_list-table.scss`, etc. Add the block to the matching partial
and it's already `@forward`ed via `global.scss`.

### Known-good canonical patterns (copy these, don't reinvent)

- **Buttons:** `.btn` + `.btn--primary` / `.btn--secondary` / `.btn--sm`
  from `_button.scss`. Fully rounded (`$radius-full`). Never redefine `.btn`
  in a page.
- **Section-header Edit button:** `.job-section__edit` lives in `_jobs.scss`
  under `.job-section` (global), shared by the Schedule / Products & Services
  / Billing / Recurring Billing section cards. This is the exact class the
  Styling Law was written for — if you add a new section card, its edit
  button is already styled.
- **Standard form row:** `.field` / `.field__label` / `.field__input` from
  `_field.scss`.

---

## Cross-links

- CLAUDE.md **Rule 2** (SCSS/BEM, Remix icons, no inline SVG) and **Rule 4**
  (Bits UI primitives for calendar/time/dropdown/select) are the source
  rules; this file is the concrete registry that makes them enforceable.
- [[feedback-use-built-datetime-not-native]] — the recurring feedback that
  prompted the date/time rows above.
- [[feedback-remix-icons]] — icon rule.
- [[feedback-share-components-not-duplicate]] — the sibling principle: when
  two screens should look alike, extract a shared component; here, when two
  components share a class, extract the style to global.
- [[unified-list-page-chassis]] — the sanctioned exception: entity-table
  CONTENT classes may be scoped IF authored and used in that one component.
