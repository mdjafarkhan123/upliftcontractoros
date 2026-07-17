# Button Unification — Migration Memory

**Project:** ContractorOs (SvelteKit 5 runes, Tailwind-free, BEM SCSS + Bits UI + Shadcn-style `ui/*`).
**Last updated:** 2026-07-11
**Status:** Step 1 DONE. Step 2 DONE. Every convertible raw `<button class="btn btn--*">` across `src` is now the unified `Button` component. The only remaining raw `<button>` elements (26 total) are intentional bespoke/scoped-class buttons left per learnings #1/#6 (calendar nav, auth/jafar submit-form buttons with scoped `__submit`/`jafar-btn` classes, icon buttons, `empty-state__action`, `rep-cta`, etc.). `npm run check` stays at the **60 errors / 58 warnings** baseline (all pre-existing, unrelated to buttons — supabase gen-types install prompt noise, `TelnyxMessagePayload` casts, and `Select.Item value={number}` type errors in booking settings).

---

## Original requirement (user)

1. **Global rule:** every button must include `white-space: nowrap`.
2. **One reusable button:** all buttons = a single reusable component; it must never be duplicated or recreated elsewhere in the codebase.

## What is DONE

- **Unified `Button` component** lives at `src/lib/components/ui/button/button.svelte` (exported as `Button` from `src/lib/components/ui/button/index.ts`).
  - Variants: `default`(=primary), `destructive`, `danger-outline`, `outline`, `secondary`, `ghost`, `link`.
  - Sizes: `default`, `sm`, `lg`, `icon`.
  - `href` prop → renders an `<a>` instead of `<button>` (link/CTA pattern).
  - Built-in async states: `onAction` (self-managing idle→loading→success→idle) OR controlled `loading`/`success` booleans.
  - `loadingLabel`, `successLabel`, `successHoldMs`, `icon` (Snippet), `onclick`, `disabled`, `type`, `class`, `children` (Snippet = label content).
  - Width-locking: idle content always rendered (hidden when busy) so it never resizes; spinner/check overlay centered.
- **Global `white-space: nowrap`** added to `src/lib/styles/app.scss` BASE ELEMENTS section (`button { white-space: nowrap; }`), so EVERY `<button>` (including raw ones with custom classes) obeys it. `.btn` block and `Button`'s inner span also set it.
- **`JetEngineButton` retired:** deleted `src/lib/components/shared/JetEngineButton.svelte`. All ~29 importing files migrated to `Button` (`label=`→children, `state={x?'loading':'idle'}`→`loading={x}`). `npm run check` passed with zero migration errors.

## Remaining: Step 2 — convert raw `<button>` elements

There are **744** raw `<button>` matches across `src`. Many already use `class="btn btn--*"` (correctly styled, just not the component). The "~73" target = files/buttons that hand-build buttons with custom classes or bare `<button>` that should become `<Button>`. Migration is best done in batches by area.

### Find candidates

`grep '<button' src/**/*.svelte` — then convert each. Skip buttons owned by third-party Bits UI internals.

### `.btn` class → `Button` prop mapping (from `src/lib/styles/components/_button.scss`)

| Raw class             | Button prop                                              |
| --------------------- | -------------------------------------------------------- |
| `btn--primary`        | default (omit variant)                                   |
| `btn--danger`         | `variant="destructive"`                                  |
| `btn--danger-outline` | `variant="danger-outline"`                               |
| `btn--outline`        | `variant="outline"`                                      |
| `btn--secondary`      | `variant="secondary"`                                    |
| `btn--ghost`          | `variant="ghost"`                                        |
| `btn--link`           | `variant="link"`                                         |
| `btn--sm`             | `size="sm"`                                              |
| `btn--lg`             | `size="lg"`                                              |
| `btn--icon`           | `size="icon"`                                            |
| `btn--success`        | `success` (state, not variant)                           |
| `btn--full`           | keep as `class="btn--full"` (utility, not a Button prop) |

### Conversion rules

1. `import { Button } from '$lib/components/ui/button';` (add once per file).
2. `<button class="btn btn--primary" onclick={x}>Text</button>` → `<Button onclick={x}>Text</Button>`.
3. Strip the `btn btn--*` classes; translate to `variant`/`size` per table. Keep extra utility classes (e.g. `btn--full`) via the `class` prop.
4. Text between tags → children. `{#snippet icon()}` children stay as children (captured as `icon` prop).
5. `aria-label`, `aria-pressed`, `title`, `disabled`, `onclick`, `data-*`, etc. pass straight through (Button spreads `...rest` onto the element).
6. **CRITICAL — `type`:** `Button` defaults to `type="button"`. Any raw button that is `type="submit"` (inside a `<form>`) MUST keep `type="submit"` explicitly or the form breaks. Audit before converting.
7. Icon/utility buttons (close `×`, scrim, copy, add) with custom BEM classes: wrap as `<Button class="<original-class>" variant="ghost" size="icon" ...>` when sensible, OR keep their custom class via the `class` prop. Preserve their existing SCSS styling; do not drop the class or they lose their look.
8. Anchor buttons (`<a class="btn ...">`) → `<Button href="...">`.

### Gotchas

- Do NOT convert `<button>` elements that are Bits UI internals (e.g. inside `Dialog.*`, `Popover.*`, `DropdownMenu.*` rendered subtrees) — only our own hand-authored buttons.
- `npm run check` after each batch; fix only migration-caused errors.
- Keep `white-space: nowrap` behavior intact (the global rule covers it, so dropping `btn` class is safe).

---

## HARD-WON LEARNINGS (read before continuing — these override naive conversion)

1. **Scoped-class gotcha (most important).** A `<button class="btn btn--x foo__bar">` where `foo__bar` is defined in the _component's own_ `<style>` block CANNOT be safely converted to `<Button class="foo__bar">`: the child `Button` element does not get this component's scoping hash, so (a) the styling silently stops applying and (b) svelte-check emits `Unused CSS selector ".foo__bar"`. **Rule:** only convert buttons whose extra classes are GLOBAL (live in `src/lib/styles/**/*.scss`). If the extra class is scoped, either LEAVE the button raw, or delete/move the scoped CSS. How to check: `grep "foo__bar" src/lib/styles` (global) vs. a `&__bar` inside the file's `<style>` (scoped).
2. **Manual loading spinners → `loading` prop.** Many raw buttons hand-rolled `{#if busy}<i class="ri-loader-4-line X__spin">…{/if}`. Replace with `<Button loading={busy} …>`. If the button showed spinner ONLY (no text) while busy → no `loadingLabel` (matches Button default: content hidden, spinner overlay). If it showed a label like "Saving…"/"Loading…"/"Generating…" while busy → pass `loadingLabel="Saving…"`. Then DELETE the manual `<i …__spin>`. If that `__spin` class was SCOPED and this was its only use, also delete the scoped `&__spin { … }` block AND its `@keyframes` (done for `ListPageShell`, `JobSignoffSection`, `JobFormSignatureField`). Global spins (`job-section__spin`, `job-links__spin` in `_jobs.scss`) can just be dropped, no CSS cleanup.
3. **`disabled` + `loading`.** `Button` auto-disables while loading (`disabled={disabled || isBusy}`). So `disabled={saving || !canSave}` on a button whose spinner is driven by `saving` becomes `loading={saving} disabled={!canSave}`. Don't double up `disabled={saving}` when `loading={saving}`.
4. **`btn--success` has NO variant.** Button only applies `btn--success` for its transient success STATE. A persistent green button (e.g. appointments `[id]/+page.svelte` "Mark complete", and any `btn--success btn--full`) has no faithful Button equivalent → **left as raw `<button>`**. DECISION NEEDED: add a `success` variant to `button.svelte` (safe — its state also uses `btn--success`), then convert these. Until then, leave them raw.
5. **Bits UI trigger spans.** `<span class="btn btn--secondary btn--sm">` inside `Popover.Trigger` / `Sheet.Trigger` (in `*FilterControl.svelte`) are intentional trigger children — **do NOT convert** (they aren't `<button>` and Button would render a nested button).
6. **Bespoke buttons to LEAVE** (own full styling: tabs / scrims / segmented / nav / toggles / icon-circles). Global `white-space:nowrap` already covers them: QuickCreate tabs+scrim+add+more; cal-header nav/icon/seg btns; CardDetailPopover (all); CalendarWeekGrid/MonthView/MiniCalendar grid cells; CrewPicker toggles; Toaster action/close; `EditPencil`; `EmptyState__action` (scoped class); appt-filters items; send-doc channel/reset/token; document editor toggle btns; contact-filter scope options; `JobTimeTrackingSection` timer buttons (scoped `__timer-btn`).
7. **`type="submit"` audit.** Button defaults to `type="button"`. Submit buttons already using `<Button type="submit">` are fine; when converting a RAW `type="submit"` button, keep `type="submit"`. (No raw submit buttons were converted this session; still audit each new file.)
8. Passthrough works: `aria-*`, `title`, `style`, `disabled`, `data-*` all forward via `...rest`. Anchors `<a class="btn …" href>` → `<Button href="…" variant=… size=…>`.

---

## STEP 2 PROGRESS LOG (2026-07-11 session)

### DONE (converted, check stayed at 60/58)

- **Appointments:** `CalendarHeader.svelte` (Today/Cancel/New), `AppointmentForm.svelte` (Cancel), `routes/(app)/(pages)/appointments/[id]/+page.svelte` (Edit/no-show/cancel; **left** the `btn--success` "Mark complete" — see learning #4). `QuickCreatePopover`/`CardDetailPopover`/`CalendarWeekGrid`/`CalendarMonthView`/`MiniCalendar`/`CrewPicker` = all bespoke, left; `appointments/+page.svelte` filter items bespoke, left.
- **Shared:** `NotifyDialog.svelte` (copy-link + 2 footer), `EditActionBar.svelte` (now uses `loading`), `ContactPicker.svelte` (Change), `ListPageShell.svelte` (Load more + removed scoped `__spin` CSS). `ConfirmDialog` already Button. Left bespoke: `Toaster`, `EditPencil`, `EmptyState` (scoped action class).
- **Invoices/Quotes:** `PaymentLinkDialog`, `RecordPaymentDialog`, `ApplyTemplateDialog`, `CatalogItemSheet` (save→loading), `ContactPickerSheet`, `LineItemEditor` (3), `ServiceAddressPicker` (Add + Cancel), `QuoteInPersonSignDialog` (Back/Continue/Approve→loading), `QuoteOfflineResultDialog` (Cancel + conditional-variant submit→loading), `SaveToCatalogSheet` (4), `ShareQuoteLinkDialog`, `TemplateEditorSheet` (Cancel). `DownloadPdfButton` already Button. Left: `QuoteFilterControl` trigger spans (Bits), `Document*Editor` toggle btns (bespoke).
- **Contacts/Pipeline:** `AddressesTab` (2), `NotesTab` (2), `ContactForm` (Restore→loading, Cancel), `DeleteContactDialog` (Cancel), `jobs/OnMyWayDialog` (Cancel). Pipeline dialogs (`OpportunityDetailSheet`/`LostReasonDialog`/`NewOpportunitySheet`) had NO raw `.btn` buttons (already migrated).
- **Jobs (whole section):** `JobBillingSection`, `JobLinksSection`, `JobLineItemsSection`, `JobReviewIndicator`, `JobCostingSection`, `JobCustomFieldsSection`, `JobTasksSection`, `JobTimeTrackingSection` (Log time + form actions; **left** 2 timer buttons w/ scoped `__timer-btn`), `JobFormsSection` (4, per-action `loading`), `JobSignoffSection` (3 + removed scoped spin CSS), `JobFormSignatureField` (3 + removed scoped spin CSS), `JobTagsEditor`, `JobTimelineSection` (Load more), `JobVisitsSection` (2), `JobRecurringBillingSection` (Generate), `RecurringScheduleModal` (3).

### REMAINING — resolved (2026-07-12 cold-session pickup)

The cold-session batch audited and converted the rest:

- **Contacts utility files:** audited `BulkActionBar`, `ContactDetailHeader`, `ContactImportModal`, `ContactQuickActions`, `ContactTagsEditor`, `MergeContactDialog`, `TimelineTab`, `AddressesTab`, `NotesTab`, `ContactForm`, `ContactFilterControl`, `FollowUpPresetPopover`, etc. Every remaining raw `<button>` uses a bespoke **scoped** class (`bulk-bar__cancel`, `contact-header__back`, `contact-merge__result-btn`, `empty-state__action`, `rep-cta`, etc.) → **left raw** per learning #1 (converting would drop the scoped styling / emit Unused-CSS warnings). `ContactFilterControl` and `FollowUpPresetPopover` `btn`-class hits were Bits UI / Popover trigger spans → skip (#5).
- **Inbox:** `LogCallSheet` (2 buttons → `Button`, removed manual `log-call__spin` spinner, used `loading={saving}`), `InboxFilterPanel` (`btn btn--ghost btn--sm` → `Button`).
- **Reputation:** `SendReviewRequestButton` (`btn btn--primary btn--sm` → `Button`, `loading={loading}` + `loadingLabel="Sending…"`; note Button's primary variant is `default`, so `variant` omitted). `reputation/+page`, `reputation/feedback/[id]/+page` converted.
- **Settings / public routes (`i/`,`q/`,`r/`):** grep found **zero** raw `btn btn--*` buttons in these areas — all buttons there are bespoke (`jafar-btn*`, `book-manage__reschedule-btn`, `suspended__logout`, `change-pw__submit`, etc.) → left.
- **Other route pages (converted):** `invoices/+page`, `invoices/new/+page`, `invoices/[id]/+page` (6), `quotes/+page`, `quotes/templates/+page`, `quotes/[id]/+page` (5), `jobs/+page`, `jobs/new/+page` (2, removed scoped `@keyframes spin`), `contacts/+page`, `growth/+page`, `onboarding/+page` (4 submit buttons — kept `type="submit"`, used `loading={submitting}` + `btn--full` via class; removed inline `animate-spin` Tailwind spinners).
- **Final verification:** `npm run check` = 60 errors / 58 warnings (matches baseline). Fixes required during batch: `variant="primary"` → omitted (Button primary is `default`); two files (`invoices/+page`, `reputation/+page`) had a stray `</button>` because the edit's oldString didn't include the closing tag — corrected to `</Button>`.

### FINAL STATE

- Every `btn btn--*` raw button is migrated to `Button`.
- 26 intentional bespoke raw `<button>` remain (correctly, per learnings #1/#6).
- Global `white-space: nowrap` rule covers all buttons.

## Verification

- `npm run check` stays at the **60 errors / 58 warnings** baseline (zero NEW errors/warnings). If a new `Unused CSS selector` warning appears, you hit learning #1 — fix the scoped CSS.
- After a batch, confirm no `Cannot find name 'Button'` (missing import — happened once when a button was converted but the import edit was skipped).
- Visually: buttons render identically, never wrap; loading/success states still work.
- Final grep `Select-String -Path src\**\*.svelte -Pattern '<button'` should only show intentional non-component buttons (Bits internals / bespoke tabs·scrims·segmented·toggles·icon-circles / scoped-class buttons intentionally left).
