# Uplift Contractor CRM — Pipeline & Quote System Plan

## Version 3.1 | June 2026 | Build-Ready Specification

---

## 1. Pipeline Stages & Status Model

> **Architecture note (authoritative):** This app uses a **status model**, NOT Won/Lost columns
> (Pipedrive/GHL pattern, already built). The board renders only **open** deals across the 4
> stages below. **Won** and **Lost** are values of `opportunities.status` — they are terminal
> states that REMOVE the card from the board, not columns you drag into. Wherever this document
> says a deal "moves to Won/Lost", read it as "status is set to won/lost and the card leaves the
> board." Won/Lost reporting and closed-deal history are surfaced on separate views, not the board.

### Board stages (4 — `status = 'open'`)

| #   | Stage         | Color  | What It Means                         | Auto-Follow-Up |
| --- | ------------- | ------ | ------------------------------------- | -------------- |
| 1   | **New Lead**  | Blue   | Inbound contact, zero human touch     | +1 day         |
| 2   | **Contacted** | Purple | Meaningful human conversation started | +3 days        |
| 3   | **Scheduled** | Orange | Confirmed appointment booked          | +1 day         |
| 4   | **Quoted**    | Yellow | Quote sent, awaiting client decision  | +3 days        |

### Terminal statuses (NOT columns — `status = 'won' | 'lost'`)

| Status   | Color | What It Means              | Board Behavior                 |
| -------- | ----- | -------------------------- | ------------------------------ |
| **Won**  | Green | Client accepted            | Leaves board; auto-archive 7d  |
| **Lost** | Red   | Client declined or ghosted | Leaves board; auto-archive 30d |

---

## 2. Stage Transition Rules

| From          | To            | Trigger                                                                        | Who Moves             | Guard                                                      |
| ------------- | ------------- | ------------------------------------------------------------------------------ | --------------------- | ---------------------------------------------------------- |
| **New Lead**  | **Contacted** | Meaningful outbound customer communication (call logged, SMS sent, email sent) | **SYSTEM AUTO-MOVES** | Must be human action, not automation or internal activity  |
| **Contacted** | **Scheduled** | Confirmed appointment booked (date + time + address + status=confirmed)        | **SYSTEM AUTO-MOVES** | Must be confirmed, not tentative                           |
| **Scheduled** | **Quoted**    | First quote sent to client                                                     | **SYSTEM AUTO-MOVES** | Only first send. Revisions do NOT move                     |
| **Quoted**    | **Won**       | Client taps "Accept" on quote page                                             | **SYSTEM AUTO-MOVES** | Idempotent. Optional: deposit required first (org setting) |
| **Quoted**    | **Lost**      | Client taps "Decline" on quote page                                            | **SYSTEM AUTO-MOVES** | Must have decline reason                                   |
| **Quoted**    | **Lost**      | Admin marks lost manually                                                      | **MANUAL**            | Must have lost reason picked                               |
| **Any**       | **Any**       | Admin drags card against normal flow                                           | **MANUAL**            | Confirmation for Won/Lost                                  |

### What Does NOT Move Stages

| Action                 | Result                 | Why                             |
| ---------------------- | ---------------------- | ------------------------------- |
| Speed-to-Lead auto-SMS | Stays in **New Lead**  | Automation ≠ human contact      |
| Internal note added    | Stays in current stage | No client interaction           |
| Task created           | Stays in current stage | No client interaction           |
| Lead replies inbound   | Stays in current stage | Contractor hasn't responded yet |
| Tentative booking      | Stays in **Contacted** | Not confirmed yet               |

---

## 3. Direct Booking Exception

| Entry Method                   | First Stage                                | Auto-Flow                                                                                          |
| ------------------------------ | ------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| Form fill / missed call / chat | New Lead                                   | Auto→Contacted on human outbound → Auto→Scheduled on confirmed booking → Auto→Quoted on first send |
| **Direct booking link**        | **Scheduled** (skips New Lead + Contacted) | Auto→Quoted on first send                                                                          |

---

## 4. Quote Statuses (7 Total)

| Status             | Icon | Color  | Meaning                           |
| ------------------ | ---- | ------ | --------------------------------- |
| Draft              | —    | —      | Internal only                     |
| Sent               | 📤   | Gray   | Delivered, not opened             |
| Viewed             | 👁️   | Blue   | Client opened quote               |
| Revision Requested | 🔄   | Orange | Client wants changes              |
| Accepted           | 🎉   | Green  | Client approved → moves to Won    |
| Declined           | ❌   | Red    | Client rejected → moves to Lost   |
| Expired            | ⏰   | Gray   | Validity passed → stays in Quoted |

### Color Rules

| Color  | Means         | When                            |
| ------ | ------------- | ------------------------------- |
| Gray   | Waiting       | Sent, Expired                   |
| Blue   | Engaged       | Viewed (any version, any count) |
| Orange | Action needed | Revision Requested              |
| Green  | Success       | Accepted only                   |
| Red    | Dead          | Declined only                   |

**Viewed is always blue.** Never green. Some customers view 15 times and never buy. Green = success.

---

## 5. Quote Versioning

### First-Class Concept (Internal)

```
Quote #1023
├── current_version: 3
├── versions: [v1, v2, v3]
└── history:
    Jun 15, 9:00 AM — 📤 Sent v1
    Jun 15, 2:00 PM — 👁️ Viewed v1
    Jun 16, 11:00 AM — 🔄 Revision requested
    Jun 16, 4:00 PM — 📤 Sent v2
    Jun 17, 10:00 AM — 👁️ Viewed v2
    Jun 17, 3:00 PM — 🔄 Revision requested
    Jun 18, 9:00 AM — 📤 Sent v3
    Jun 18, 2:00 PM — 👁️ Viewed v3
    Jun 20, 10:00 AM — 🎉 Accepted v3
```

**User sees:** "Viewed (v3)" or "Sent (v2)". Version is subtle but tracked.

**Why versions matter:** Disputes. "You said $8,500." "No, v3 was $11,500 and you accepted it."

---

## 6. Quote Lifecycle Example

```
Day 1: Mike sends quote v1 ($13,500)
    Card: 📤 "Sent"

Day 1: Sarah views
    Card: 👁️ "Viewed"
    Mike gets push: "👁️ Sarah viewed your quote"

Day 2: Sarah requests changes
    Card: 🔄 "Revision requested"

Day 3: Mike sends v2 ($11,500)
    Card: 📤 "Sent (v2)" — pulsing

Day 3: Sarah views v2
    Card: 👁️ "Viewed (v2)" — BLUE (engaged, not success)
    Mike gets push: "👁️ Sarah viewed revised quote"

Day 4: Sarah requests another change
    Card: 🔄 "Revision requested"

Day 5: Mike sends v3 ($10,800)
    Card: 📤 "Sent (v3)" — pulsing

Day 5: Sarah views v3 (3 times throughout day)
    Card: 👁️ "Viewed (v3)" — still BLUE
    Detail shows: "Viewed 3 times"

Day 6: Sarah accepts
    Card: 🎉 "Accepted!" — GREEN (success)
    Auto-moves to Won
```

---

## 7. Pipeline Card Design

```
┌──────────────────────────────────────────────┐
│ Sarah Johnson            🔥 HOT [🏠 Roof]    │
│ Roof Repair                                  │
│                                              │
│ 💰 $11,500                                   │
│                                              │
│ 👁️ Viewed (v3)                              │
│ 3 views • Last viewed 15m ago                │
│                                              │
│ ⏰ Follow up: Today                           │
│ 🟡 Quote Age: 5d                             │
│ 👤 Mike                                      │
└──────────────────────────────────────────────┘
```

**Age badges:** Green (0-3d) → Yellow (4-7d) → Red (8+d) → Red pulse (overdue follow-up)

**Quote age visible:** "Quoted 5 days" — contractors live and die by this.

---

## 8. Lost & Expired Handling

### Expired ≠ Lost

|                | Expired                              | Lost                                 |
| -------------- | ------------------------------------ | ------------------------------------ |
| **Trigger**    | Quote validity passed (7/14/30 days) | Client declined or admin gave up     |
| **Card stays** | In **Quoted** stage                  | `status='lost'` — card leaves board  |
| **Badge**      | ⏰ Expired                           | ❌ Declined                          |
| **Revivable?** | Yes — extend, edit, resend           | Rarely — reopen existing opportunity |
| **Example**    | Customer calls back 3 months later   | Customer chose competitor            |

### Client Decline Flow

```
❌ Why are you declining?
○ Price too high
○ Going with competitor
○ Bad timing
○ Scope changed
○ Other: [text]
[Submit]
```

### Admin Mark Lost

```
Reason: ○ Price ○ Competitor ○ Timing ○ Ghosted ○ Scope ○ Other
Note: [textarea]
[Confirm Lost]
```

### Auto-Ghost Rule

In organizaton settings proper place we should add flexible rule for ghosting marking:
Organization Setting

"" Ghost Lead Suggestion:
○ 7 days
○ 14 days (default)
○ 21 days
○ 30 days

""

### Expired Quote Actions

Status → Expired. Card stays in Quoted. Admin options: [Extend] [Mark Lost] [Call]

---

## 9. Org Setting: Won Trigger

```
When is a deal "Won"?
○ On quote acceptance (default)
◉ On deposit paid
```

**Default:** Quote acceptance. Larger contractors may require deposit first.

---

## 11. Summary

| Stage                 | Movement                               | Trigger                                      |
| --------------------- | -------------------------------------- | -------------------------------------------- |
| New Lead → Contacted  | **Auto**                               | Meaningful human outbound (call, SMS, email) |
| Contacted → Scheduled | **Auto**                               | Confirmed appointment                        |
| Scheduled → Quoted    | **Auto**                               | First quote sent                             |
| Quoted → Won          | **Auto**                               | Client accepts                               |
| Quoted → Lost         | **Auto** (client) / **Manual** (admin) | Client declines / Admin decides              |
| Any reverse/skip      | **Manual**                             | Admin override                               |

**Key rules:**

- Human actions move stages. Automation doesn't.
- Viewed is always blue. Green = Accepted only.
- Expired ≠ Lost. Expired stays in Quoted.
- Versions tracked internally for disputes.

**The pipeline is a reflection of work done, not a todo list to maintain.**
