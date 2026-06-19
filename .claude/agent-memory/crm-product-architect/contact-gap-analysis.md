---
name: contact-gap-analysis
description: Contact module gap analysis vs industry CRMs — what exists, what's missing, agreed priorities
metadata:
  type: project
---

## What exists (verified 2026-06-12, full code read)

**Schema:** `contacts` table: full_name, company_name, phone (E.164, unique per org including soft-deleted), alt_phone + alt_phone_label (phone_label enum: mobile/home/work/fax/other), email, avatar_url (R2 key), tags (TEXT[]), status (lead/customer/archived), assigned_to, referred_by_contact_id, sms_opt_out + metadata, do_not_contact + do_not_contact_at, lead_source (14 enum values), lead_temperature (hot/warm/cold), notes (freetext, 2000 char), last_contacted_at, next_follow_up_at, converted_at, preferred_contact_method, email_opt_in, deleted_at.

Supporting tables: `contact_addresses` (multi-address, label: billing/service/mailing/other, is_primary enforced by partial unique index), `contact_notes` (author-attributed, soft-deletable, max 10 loaded in detail query).

**List page:** cursor-based pagination (25/page), filters: status tabs (all/leads/customers/archived/deleted), search (name/company/email/phone/alt_phone), single tag filter, temperature filter, scope (mine/team/unassigned), permission-gated (can_view_all_contacts). Recycle bin with 30-day soft-delete + hard purge. Import CSV (2000 rows, 5MB) + Export CSV (10K rows, filter-aware). Badge counts on Archived and Deleted tabs.

**Detail page:** Header card with avatar upload, all contact fields, SMS opt-out banner; KPI strip (lifetime_revenue, open_quotes, active_jobs, last_contacted, next_follow_up); Quick Actions (Call, Message → opens inbox/compose, Quote, Book Appointment, Note, Follow-up preset, Convert to Customer); Timeline tab (paginated, searchable with 250ms debounce, filterable by 8 category chips: messages/quotes/invoices/appts/jobs/reviews/notes/automations, day-separator grouping, chat-bubble style for messages); Notes tab; Addresses tab; Files tab; Linked Records tab (mobile) + sidebar counts with deep links (desktop).

**Bulk actions:** Assign, tag add/remove, archive, unarchive, delete (capped at 100 at a time). Active mode shows Assign/Tag/Archive; Archived mode shows Restore/Delete.

**Merge:** Full `mergeContacts()` in contactRepo.ts — reparents 12 tables (contact_notes, opportunities, jobs, quotes, invoices, appointments, review_requests, reviews, private_feedback, media, activity_events, webchat_sessions), folds tags union, status escalates to customer, SMS opt-out is sticky (TCPA), preserves alt_phone, closes duplicate open conversations, demotes duplicate primary addresses, writes audit note + outbox event `contact.merged`. MergeContactDialog exists in UI.

**Compliance:** SMS opt-out enforced (immutable via PATCH, keyword-only), do_not_contact flag, TCPA opt-in/opt-out keywords, email_opt_in boolean. opt-out source tracked.

**Follow-up reminder:** `next_follow_up_at` field + 15-min cron sweep fires `contact.follow_up_due` → in-app notification to assignee.

## Confirmed gaps (P0/P1/P2)

**P0 — Table stakes missing:**
1. **No multi-tag filter.** `tag` state is a single string; API accepts one tag. No AND/OR multi-tag query. GHL/HubSpot both do multi-tag.
2. **Import fires no outbox events.** Raw `db.insert()` in `/api/contacts/import` — no `contact.created` events, no automations triggered for imported leads. Silent adoption killer.
3. **No saved segments / smart lists.** No persisted filter combinations. Jobber has segments; GHL has smart lists.
4. **Import missing fields.** HEADER_MAP in import route does not map: company_name, lead_temperature, assigned_to. These fields silently fail.

**P1 — Meaningful gaps:**
5. **No sort control.** Hard-coded `ORDER BY created_at DESC`. No sort by last_contacted_at (stale lead queue) or name.
6. **Notes capped at 10.** `contactRepo.ts` loadContactDetail: `.limit(10)`. Notes 11+ are silently invisible. No pagination in NotesTab.
7. **Export missing fields.** Omits: company_name, lead_temperature, alt_phone_label, next_follow_up_at, converted_at, referred_by name/id.
8. **No referral filter on list.** referred_by_contact_id exists in schema and detail, but no list filter for "referred contacts" or "contacts who referred others."
9. **Timeline search/filter confirmed working.** TimelineTab.svelte has search input + 8 category chips wired to API. This gap from prior memory is RESOLVED.
10. **Quick Actions confirmed complete.** Call, Message (opens inbox/compose), Quote, Book, Note, Follow-up, Convert all present. This gap from prior memory is RESOLVED.

**P2 — Nice-to-have / overkill for segment:**
11. No custom fields (skip for $200K–$2M contractors).
12. No duplicate detection beyond same-phone.
13. No contact scoring.
14. No bulk SMS/email blast (needs campaign module).

**Why:** Full re-read of all contact files 2026-06-12 to verify prior memory and resolve gaps 9/10.
