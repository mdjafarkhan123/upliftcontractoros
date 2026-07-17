# One-Off Job — Engineering Specification

> **Scope:** Job Creation page (Schedule block) + Job Detail page (Scheduled Visits section).  
> **Image refs** are preserved as-is so the implementer can cross-check visuals.  
> **Recurring job** logic is out of scope for this document.

---

## 1. Data Model (conceptual)

```
Job
 ├── id
 ├── title
 ├── client / property fields
 ├── type: "one_off" | "recurring"
 ├── status: "active" | "action_required" | "on_hold" | "completed"
 ├── schedule_later: boolean
 ├── repeat_mode: "does_not_repeat" | "as_needed" | "custom"
 ├── custom_schedule?: CustomSchedule       -- only when repeat_mode === "custom"
 ├── ends_after?: { value: number; unit: "days"|"weeks"|"months"|"years" }
 ├── ends_on?: Date
 ├── visit_instructions?: string
 └── visits: Visit[]

Visit
 ├── id
 ├── job_id
 ├── start_date?: Date
 ├── start_time?: Time
 ├── end_time?: Time
 ├── any_time: boolean
 ├── assigned_to?: TeamMember[]
 ├── notify_team: boolean
 ├── status: "scheduled" | "completed"
 ├── notes?: string
 └── attachments?: Attachment[]

CustomSchedule
 ├── every: number                          -- positive integer
 ├── unit: "day" | "week" | "month" | "year"
 ├── days_of_week?: DayOfWeek[]            -- only when unit === "week"
 └── month_mode?: "day_of_month" | "day_of_week"
      └── month_days_of_week?: DayOfWeek[] -- only when month_mode === "day_of_week"
```

---

## 2. Job Creation Page

### 2.1 Top Section `ref/job-new/1.jpg`

| #   | Field                        | Type   | Notes                                             |
| --- | ---------------------------- | ------ | ------------------------------------------------- |
| 1   | Client / Property            | lookup | existing or new                                   |
| 2   | Job Title                    | text   |                                                   |
| 3   | (third field — confirm name) | text   |                                                   |
| +   | **Add new field** button     | action | appends a dynamic extra field `ref/job-new/2.jpg` |

---

### 2.2 Schedule Block (One-Off) `ref/job-new/3.jpg`

This entire block is the **source of truth** for scheduling. On the Job Detail page it is surfaced as the "Scheduled Visits" section (§ 3). The "Edit all visits" button on the detail page re-opens this same block as a modal.

#### 2.2.1 Job Type Toggle

- Values: **One-off** | Recurring
- This document covers **One-off only**.

#### 2.2.2 Visit Count Indicator

- Displays total visit count beneath the toggle header.
- Auto-updates as the user adds/removes visits.

#### 2.2.3 Start Date Field

- **Default:** today's date (the date the user opens the "Create Job" page).
- User can change it with a date-picker.

#### 2.2.4 "Schedule Later" Checkbox `ref/job-new/5.jpg`

| State                   | Behavior                                                                                                  |
| ----------------------- | --------------------------------------------------------------------------------------------------------- |
| **Unchecked** (default) | All date/time fields are enabled.                                                                         |
| **Checked**             | All date/time fields (start date, start time, end time, any-time checkbox) are **disabled / greyed out**. |

- When a job is saved with "Schedule Later" checked:
  - A visit record **is** created, but with no date/time values.
  - The visit appears in the Scheduled Visits list `ref/job-detail/1.jpg` as an unscheduled placeholder.
  - No booking card appears on the Schedule calendar.

#### 2.2.5 Time Fields

| Field               | Default                           | Rules                                                                                                                                              |
| ------------------- | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Start time          | _(empty)_                         | User must pick manually.                                                                                                                           |
| End time            | _(empty until start time is set)_ | Auto-set to **start time + 1 h** when the user picks a start time. User may then adjust. End time **cannot be left empty** once start time is set. |
| "Any time" checkbox | unchecked                         | When checked → both start time and end time fields are **disabled**.                                                                               |

#### 2.2.6 Assignment Fields

- **Assigned to:** multi-select team member picker.
- **"Notify team about assignment"** checkbox — sends a notification when checked.

#### 2.2.7 Visit Instructions

- Textarea.
- Free-form text describing what needs to be done on this visit.

---

### 2.3 Repeat Field `ref/job-new/4.jpg`

#### 2.3.1 Dropdown Options (default state)

```
Does not repeat      ← default selected
──────────────────
As needed — we won't prompt you
Custom schedule…
And more.. see in image
```

> **Note:** A fourth option, **"Custom"**, is injected dynamically — see § 2.3.3.

#### 2.3.2 Option: "Does not repeat"

- No additional fields shown.
- A single visit is created using the date/time values from § 2.2.

#### 2.3.3 Option: "As needed — we won't prompt you"

- Start time and end time fields are **disabled**.
- **No scheduled visits are created.**
- The contractor manually adds visits later from the Job Detail page.
- Job status is set to **"Action Required"** (a.k.a. "On Hold").
- No booking card appears on the Schedule calendar.

#### 2.3.4 Option: "Custom schedule…" `ref/job-new/9.jpg`

Opens the **Custom Schedule Modal** (§ 2.4).

- If the user saves a preset inside the modal → the repeat dropdown gains a new **"Custom"** option, which is auto-selected.
- If the user opens the modal but exits without saving → the dropdown reverts to its previous selection ("Does not repeat" or whatever was selected before).

#### 2.3.5 Dynamic "Custom" Option (injected) `ref/job-new/12.jpg`

```
Does not repeat
──────────────────
As needed — we won't prompt you
Custom schedule…        ← always present
──────────────────
Custom                  ← injected after a preset is saved
```

| User action                                                            | Result                                                                           |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Saves a custom schedule preset                                         | "Custom" option appears; is auto-selected; stores the preset.                    |
| Selects "Custom schedule…" again                                       | Modal opens pre-populated with the existing preset; user can overwrite it.       |
| Selects **any other option** (not "Custom schedule…" and not "Custom") | "Custom" option is **removed** from the dropdown; the saved preset is discarded. |

#### 2.3.6 "Ends after" and "Ends on" Fields `ref/job-new/7.jpg, 8.jpg`

These fields appear when **any repeat option other than "Does not repeat"** is selected.

| Field          | Type                         | Details                                                             |
| -------------- | ---------------------------- | ------------------------------------------------------------------- |
| **Ends after** | number input + unit dropdown | Number: positive integer only. Unit: Days / Weeks / Months / Years. |
| **Ends on**    | date picker                  | Absolute end date for the repeat.                                   |

Only one of "Ends after" or "Ends on" should be active at a time (radio-style exclusivity — confirm UX preference).

---

### 2.4 Custom Schedule Modal `ref/job-new/9.jpg`

Opened via "Custom schedule…" from the Repeat dropdown.

#### 2.4.1 Fields

| Field           | Type                                        | Default |
| --------------- | ------------------------------------------- | ------- |
| Every           | positive integer input                      | 1       |
| Unit            | dropdown: Day / Week / Month / Year         | Week    |
| Dynamic section | renders based on Unit selection (see below) | —       |

#### 2.4.2 Dynamic Section — by Unit

**Day** → Dynamic section is **hidden** (no extra options).

**Week** → Render a **day-of-week row** (Mon–Sun, multi-select toggles).  
`ref/job-new/9.jpg` shows this state as the default.

**Month** → Render two radio options:

- **Day of month** (default selected) `ref/job-new/10.jpg` — user selects specific calendar dates.
- **Day of week** `ref/job-new/11.jpg` — renders a day-of-week row (Mon–Sun, multi-select toggles).

**Year** → Dynamic section is **hidden** (no extra options).

#### 2.4.3 Modal Buttons

| Button     | Behavior                                                                                                        |
| ---------- | --------------------------------------------------------------------------------------------------------------- |
| **Clear**  | Resets the modal to its default state (Every = 1, Unit = Week, no days selected). Does **not** close the modal. |
| **Cancel** | Closes modal without saving. Dropdown reverts to previous selection.                                            |
| **Save**   | Persists the preset. Closes modal. Dropdown selects / updates "Custom" option.                                  |

---

## 3. Job Detail Page

### 3.1 Overview / Top Section `ref/job-detail/2.jpg`

High-level job summary (client name, address, status badge, etc.). Implementation detail TBD — not the focus of this spec.

---

### 3.2 Scheduled Visits Section `ref/job-detail/3.jpg, 1.jpg`

This section is the runtime view of the Schedule block defined in § 2.2.

#### 3.2.1 Section Header Area

- **Summary row** — e.g., "3 visits · 2 completed".
- **"Edit all visits" button** — see § 3.3.
- **Status filter** dropdown — default: **All**; options: All | Completed | Incomplete.
- **"+" icon** (top-right of list) — see § 3.4.

#### 3.2.2 Visit List Columns

| Column               | Content                                                                                           |
| -------------------- | ------------------------------------------------------------------------------------------------- |
| Date & Time          | Scheduled date + time range (or "Unscheduled" if schedule_later).                                 |
| Title & Instructions | Visit title + truncated instructions.                                                             |
| Status               | Scheduled / Completed badge.                                                                      |
| Assigned             | Avatar(s) of assigned team member(s).                                                             |
| Actions              | **Tick icon** (mark complete) + **Pencil icon** (edit) — replaced after completion (see § 3.5.1). |

#### 3.2.3 Unscheduled Visit Placeholder `ref/job-detail/1.jpg`

- Rendered when a job was created with "Schedule Later" checked **or** "As needed" repeat mode.
- Appears in the list like a normal visit row but shows no date/time.

---

### 3.3 "Edit All Visits" Button `ref/job-detail/4.jpg`

- Opens a **modal** that contains the **exact same Schedule block** as the Job Creation page (§ 2.2).
- All current values are pre-populated.
- Saving overwrites the schedule for all visits on this job.
- This is the **parent / master** control for the job's entire schedule.

---

### 3.4 Add Individual Visit ("+" Icon) `ref/job-detail/5.jpg`

- Opens a **lightweight popup** with the minimum required fields to create a single visit.
- Fields reused from § 2.2:
  - Start date
  - Start time / End time / Any-time checkbox
  - Assigned to + Notify team
  - Visit instructions
- On save, the new visit is appended to the visit list.

---

### 3.5 Single Visit Item — Interactions

#### 3.5.1 Clicking a Visit Row `ref/job-detail/6.jpg`

Opens a **Visit Detail panel / drawer** containing:

- **"Mark complete"** button — same action as the Tick icon in the list.
- ~~**"More actions"** button~~ — **excluded from current scope.**
- **Tabs** — only the **Notes** tab is in scope:
  - Textarea for free-form notes.
  - Attachment upload area with thumbnail preview.

#### 3.5.2 Tick Icon (Mark Complete) — in list row

| Step            | Behavior                                                                                              |
| --------------- | ----------------------------------------------------------------------------------------------------- |
| 1               | User clicks Tick icon.                                                                                |
| 2               | Show **loading spinner** on the row while the API call is in flight.                                  |
| 3               | On success → the **Tick icon and Pencil icon** are replaced by a **3-dot (⋯) menu**.                  |
| 4 (conditional) | If this was the **last remaining incomplete visit** on the job → show the completion popup (§ 3.5.3). |

#### 3.5.3 Last-Visit Completion Popup `ref/job-detail/8.jpg`

Triggered only when the final visit on a job is marked complete.

| User action                     | Result                                                                 |
| ------------------------------- | ---------------------------------------------------------------------- |
| Dismisses / Cancels popup       | Popup closes. Job status remains **"Action Required"**.                |
| Clicks **"Schedule new visit"** | Opens the Add Individual Visit popup (§ 3.4 / `ref/job-detail/5.jpg`). |

#### 3.5.4 Pencil Icon (Edit Visit) `ref/job-detail/9.jpg`

- Opens the same popup as "Add Individual Visit" (§ 3.4 / `ref/job-detail/5.jpg`), but:
  - Title is changed to **"Edit Visit"** (or equivalent).
  - All fields are **pre-populated** with the visit's current values.
- Saving updates only this specific visit (not all visits).
- Pencil icon is **hidden** once the visit is marked complete (replaced by the 3-dot menu per § 3.5.2 step 3).

---

## 4. State / Status Reference

| Scenario                               | Job Status          | Visit in Calendar     | Visit in List               |
| -------------------------------------- | ------------------- | --------------------- | --------------------------- |
| Normal scheduled visit                 | Active              | ✅ Booking card shown | ✅ Shown with date/time     |
| "Schedule Later" checked               | Active              | ❌ No card            | ✅ Unscheduled placeholder  |
| Repeat = "As needed"                   | **Action Required** | ❌ No card            | ✅ Unscheduled placeholder  |
| All visits completed, no new scheduled | Action Required     | ❌ No card            | Visits show Completed badge |

---

## 5. Component Reuse Map

| Component                 | Used in                                                                                 |
| ------------------------- | --------------------------------------------------------------------------------------- |
| **Schedule Block**        | Job Creation page § 2.2 · "Edit all visits" modal § 3.3                                 |
| **Add/Edit Visit Popup**  | "+" icon § 3.4 · Pencil icon § 3.5.4 · "Schedule new visit" in completion popup § 3.5.3 |
| **Custom Schedule Modal** | "Custom schedule…" in Repeat dropdown § 2.4                                             |

---

## 6. Open Questions (resolve before implementation)

1. **"Ends after" vs "Ends on"** — are they mutually exclusive (radio-style) or can both be set simultaneously? Jobber uses radio exclusivity.
2. **3-dot menu content** — what actions does the post-completion ⋯ menu expose? (e.g., "Unmark complete", "Delete"?) Needed for § 3.5.2.
3. **"More actions" button** — explicitly excluded from scope above; confirm.
4. **Third field** in the Top Section (§ 2.1) — what is it? (Likely "Job Description" or "Property".)
5. **"Custom" option removal** — when the user switches away from Custom, should the preset be soft-deleted (recoverable if they go back to "Custom schedule…") or hard-deleted?
