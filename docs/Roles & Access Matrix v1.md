# Roles & Access Matrix v2

# Contractor Growth Operating System

> Last Updated: May 2026 | Status: Approved | Applies To: Contractor App only | Supersedes: v1

---

# 0. Platform Owner (Super Admin)

The Platform Owner is the person who built and operates this platform. This is a system-level identity that exists entirely outside the contractor organization structure.

## Key Rules

- The Platform Owner is NOT a contractor user
- The Platform Owner has NO `org_id`
- The Platform Owner is NOT stored in Supabase Auth
- The Platform Owner is NOT subject to any RLS policy
- The Platform Owner's credentials are stored as environment variables only
- The Platform Owner authenticates exclusively through the `/jafar` route
- The Platform Owner session is a signed, httpOnly server-side cookie — completely isolated from all contractor sessions

## What the Platform Owner Can Do

```
→ Visit /jafar (hidden super admin route — known only to Platform Owner)
→ Create new contractor organizations
→ Create Admin accounts for those organizations
→ Set temporary passwords and share credentials through a secure channel
→ View all organizations (read-only list)
→ Update organization status (active / suspended)
```

## What the Platform Owner Cannot Do

```
→ Access contractor data via the Contractor App UI
→ Appear in any org-scoped query or report
→ Log in as a contractor user
→ Modify permissions, contacts, jobs, or any org data through the app
```

> **Rule:** The Platform Owner exists at the infrastructure layer, not the application layer. The `/jafar` route and its server routes are the only legitimate interface for Platform Owner actions.

---

# 1. Role Definitions

There are three roles within a contractor organization.

| Role        | Who They Are                               | Created By                |
| ----------- | ------------------------------------------ | ------------------------- |
| **Admin**   | The contractor — organization owner        | Platform Owner via /jafar |
| **Manager** | Office staff, operations lead, senior team | Admin                     |
| **Member**  | Field worker, technician, crew member      | Admin                     |

---

# 2. Admin Account Creation

Admin accounts are created exclusively by the Platform Owner. There is no self-registration flow. No public signup page exists.

## Creation Flow

```
Platform Owner visits /jafar
→ Authenticates with super admin credentials (env-var-based, server-side session)
→ Redirected to Super Admin dashboard
→ Fills org creation form: business name, trade type, location, Twilio number
→ Creates Admin account: full name + email
→ Platform Owner sets a temporary password and shares the credentials
  with the contractor through a secure channel
→ Contractor logs in with the temporary credentials. The application must
  immediately prompt them to change their password. Supabase Auth handles
  the password update securely.
→ System creates org record in the database (if not already created)
→ Contractor lands on the app dashboard and can complete their business
  profile from Account Settings at any time
```

## What Does Not Exist

```
Public registration page         → Does not exist
Admin self-signup                → Does not exist
Magic link self-onboarding       → Does not exist
Automated set-password email    → Does not exist (contractor's first login forces a password change)
```

---

# 3. Team Member Account Creation

Admin creates team member accounts directly from Team Settings.

## Creation Flow

```
Admin → Team Settings → Add Team Member
→ Enter: full name, email, password
→ Set permissions via toggles (manually or via template button)
→ Save
→ Team member can log in immediately
```

Team member accounts are created in Supabase Auth. Admin sets the password directly — no email flow.

No email sent. No invite link. No verification step. Admin shares credentials with the team member directly.

Implementation note: The Auth user creation and the org_members row insertion
with permission seeding must behave atomically. If permission initialization
fails after the Auth user is created, the partially created account must be
invalidated or cleaned up automatically (e.g., by deleting the Auth user
or deleting the partially created records).
The Admin receives a clear error and can retry the creation.

---

# 4. Permission System

## How It Works

Each team member account has a set of permission toggles.

Admin can:

- Set each toggle manually
- Click a role template button to auto-fill all toggles
- Override individual toggles after applying a template

## Role Template Buttons

```
[ Apply Manager Template ]  [ Apply Member Template ]
```

Clicking a template auto-fills all toggles to the default values defined in this document. Admin can still adjust individual toggles after applying a template.

## Admin Permissions

Admin always has full access to everything. No toggles are shown for the Admin role. Admin access cannot be restricted.

---

# 5. Full Permission Matrix

---

## MODULE 1 — Dashboard

| Permission                 | Admin    | Manager Default | Member Default |
| -------------------------- | -------- | --------------- | -------------- |
| Can view dashboard         | ✓ Always | ✓ On            | ✓ On           |
| Can view revenue figures   | ✓ Always | ✓ On            | ✗ Off          |
| Can view pipeline snapshot | ✓ Always | ✓ On            | ✗ Off          |

**Reasoning:**

- All roles get a dashboard — field workers need basic awareness
- Revenue is sensitive commercial data — Member off by default
- Pipeline is a sales view — not relevant to field workers by default

---

## MODULE 2 — Inbox

| Permission                      | Admin    | Manager Default | Member Default |
| ------------------------------- | -------- | --------------- | -------------- |
| Can view all conversations      | ✓ Always | ✓ On            | ✗ Off          |
| Can view assigned conversations | ✓ Always | ✓ On            | ✓ On           |
| Can send messages               | ✓ Always | ✓ On            | ✓ On           |
| Can delete conversations        | ✓ Always | ✗ Off           | ✗ Off          |

**Reasoning:**

- Members can only see conversations assigned to them
- Sending messages is a core job function for all roles
- Deleting conversations is destructive — Admin only

---

## MODULE 3 — Contacts

| Permission            | Admin    | Manager Default | Member Default |
| --------------------- | -------- | --------------- | -------------- |
| Can view all contacts | ✓ Always | ✓ On            | ✗ Off          |
| Can create contacts   | ✓ Always | ✓ On            | ✗ Off          |
| Can edit contacts     | ✓ Always | ✓ On            | ✗ Off          |
| Can delete contacts   | ✓ Always | ✗ Off           | ✗ Off          |

**Reasoning:**

- Members work assigned jobs only — full contact list not needed
- Creating and editing contacts is a management responsibility
- Deleting contacts is irreversible — Admin only

---

## MODULE 4 — Pipeline / Opportunities

| Permission               | Admin    | Manager Default | Member Default |
| ------------------------ | -------- | --------------- | -------------- |
| Can view full pipeline   | ✓ Always | ✓ On            | ✗ Off          |
| Can move pipeline stages | ✓ Always | ✓ On            | ✗ Off          |
| Can create opportunities | ✓ Always | ✓ On            | ✗ Off          |

**Reasoning:**

- Pipeline is a sales management tool — not a field worker view
- Stage movement and opportunity creation is a management responsibility

---

## MODULE 5 — Quotes

| Permission          | Admin    | Manager Default | Member Default |
| ------------------- | -------- | --------------- | -------------- |
| Can view all quotes | ✓ Always | ✓ On            | ✗ Off          |
| Can create quotes   | ✓ Always | ✓ On            | ✗ Off          |
| Can send quotes     | ✓ Always | ✓ On            | ✗ Off          |
| Can edit quotes     | ✓ Always | ✓ On            | ✗ Off          |
| Can delete quotes   | ✓ Always | ✗ Off           | ✗ Off          |

**Reasoning:**

- Quotes contain sensitive commercial pricing — Member off by default
- All quote actions are management responsibilities
- Deleting quotes is irreversible — Admin only

---

## MODULE 6 — Invoices

| Permission            | Admin    | Manager Default | Member Default |
| --------------------- | -------- | --------------- | -------------- |
| Can view all invoices | ✓ Always | ✓ On            | ✗ Off          |
| Can create invoices   | ✓ Always | ✓ On            | ✗ Off          |
| Can send invoices     | ✓ Always | ✓ On            | ✗ Off          |
| Can record payments   | ✓ Always | ✓ On            | ✗ Off          |
| Can delete invoices   | ✓ Always | ✗ Off           | ✗ Off          |

**Reasoning:**

- Financial data is sensitive — Member has no invoice access by default
- All invoice actions are management responsibilities
- Deleting invoices is irreversible — Admin only

---

## MODULE 7 — Appointments

| Permission                     | Admin    | Manager Default | Member Default |
| ------------------------------ | -------- | --------------- | -------------- |
| Can view all appointments      | ✓ Always | ✓ On            | ✗ Off          |
| Can view assigned appointments | ✓ Always | ✓ On            | ✓ On           |
| Can create appointments        | ✓ Always | ✓ On            | ✗ Off          |
| Can reschedule appointments    | ✓ Always | ✓ On            | ✗ Off          |

**Reasoning:**

- Members must see their own schedule — assigned appointments always on
- Creating and rescheduling is a management responsibility
- Full appointment list is a management view

---

## MODULE 8 — Reputation Management

| Permission                 | Admin    | Manager Default | Member Default |
| -------------------------- | -------- | --------------- | -------------- |
| Can view reviews           | ✓ Always | ✓ On            | ✗ Off          |
| Can send review requests   | ✓ Always | ✓ On            | ✗ Off          |
| Can view negative feedback | ✓ Always | ✓ On            | ✗ Off          |

**Reasoning:**

- Reputation management is not a field worker concern
- Negative feedback is sensitive — management and above only
- Sending review requests requires judgment — management responsibility

---

## MODULE 9 — Growth Feed

| Permission           | Admin    | Manager Default | Member Default |
| -------------------- | -------- | --------------- | -------------- |
| Can view Growth Feed | ✓ Always | ✓ On            | ✗ Off          |

**Reasoning:**

- Growth Feed shows agency marketing activity and business growth
- Members are field workers — not business stakeholders
- Managers benefit from seeing agency work and business progress

---

## MODULE 10 — Files & Media

| Permission         | Admin    | Manager Default | Member Default |
| ------------------ | -------- | --------------- | -------------- |
| Can view all files | ✓ Always | ✓ On            | ✗ Off          |
| Can upload files   | ✓ Always | ✓ On            | ✓ On           |
| Can delete files   | ✓ Always | ✗ Off           | ✗ Off          |

**Reasoning:**

- Uploading job photos is a core field worker task — Member on by default
- Viewing all org files is a management responsibility
- Deleting files is irreversible — Admin only

---

## MODULE 11 — Team Management

| Permission              | Admin    | Manager Default | Member Default |
| ----------------------- | -------- | --------------- | -------------- |
| Can view team members   | ✓ Always | ✓ On            | ✗ Off          |
| Can create team members | ✓ Always | ✗ Off           | ✗ Off          |
| Can edit team members   | ✓ Always | ✗ Off           | ✗ Off          |
| Can delete team members | ✓ Always | ✗ Off           | ✗ Off          |

**Reasoning:**

- Manager can see the team list for operational awareness
- All team management actions are Admin only — too sensitive to delegate by default

---

## Settings & Billing — Admin Only (No Toggles)

These sections are permanently restricted to Admin. They are not shown to Manager or Member under any circumstances. No toggle exists for these — they cannot be unlocked.

| Section                | Admin    | Manager | Member  |
| ---------------------- | -------- | ------- | ------- |
| Organization settings  | ✓ Always | ✗ Never | ✗ Never |
| Branding settings      | ✓ Always | ✗ Never | ✗ Never |
| Billing & subscription | ✓ Always | ✗ Never | ✗ Never |
| Integrations           | ✓ Always | ✗ Never | ✗ Never |
| Automation settings    | ✓ Always | ✗ Never | ✗ Never |

---

# 6. Role Template Summary

Quick reference for what each template button sets.

## Manager Template

```
Dashboard             → Full access including revenue and pipeline
Inbox                 → All conversations, send messages
Contacts              → View all, create, edit. No delete
Pipeline              → View, move stages, create opportunities
Quotes                → View all, create, send, edit. No delete
Invoices              → View all, create, send, record payments. No delete
Appointments          → View all and assigned, create, reschedule
Reputation            → View reviews, send requests, view negative feedback
Growth Feed           → View
Files & Media         → View all, upload. No delete
Team Management       → View team list only
Settings & Billing    → No access
```

## Member Template

```
Dashboard             → View only (no revenue, no pipeline snapshot)
Inbox                 → Assigned conversations only, send messages
Contacts              → No access
Pipeline              → No access
Quotes                → No access
Invoices              → No access
Appointments          → Assigned appointments only
Reputation            → No access
Growth Feed           → No access
Files & Media         → Upload only
Team Management       → No access
Settings & Billing    → No access
```

---

# 7. Navigation Rendering Rules

The app navigation renders based on active permissions.

```
If user has no access to a module
→ That module does not appear in their navigation
→ Direct URL access returns 403
→ No ghost links or locked icons shown
```

This keeps the UI clean and role-appropriate for every user.

> **Note:** The /jafar route is never linked anywhere in the app navigation. It is not subject to these rendering rules. It is a separate server-side protected route.

---

# 8. Implications for Schema Design

Every permission toggle maps to a boolean column directly on the `org_members` table. There is no separate `member_permissions` table.

## Permission Storage Model

```
org_members
→ role          enum('admin', 'manager', 'member')  -- base role, used for template application
→ [~39 boolean permission columns]                  -- fine-grained, authoritative source of truth

Example columns:
→ can_view_revenue
→ can_view_pipeline_snapshot
→ can_view_all_conversations
→ can_send_messages
→ can_delete_conversations
→ can_view_all_contacts
→ can_create_contacts
→ can_edit_contacts
→ can_delete_contacts
→ ... (one column per toggle in the full permission matrix)

```

## How It Works at Runtime

```
1. Admin creates team member → selects role template
2. All boolean columns are initialized to role default values
3. Admin may override individual columns after template is applied
4. role column is retained for display and re-application of templates
5. Permission checks at API and RLS level read ONLY the boolean columns
6. Boolean columns are the single source of truth — role column is never used for access control
7. All runtime permission checks (API, frontend, RLS) should go through
a shared permission layer for consistency. Direct boolean column
access or role-based checks should not be scattered across the codebase.
```

**Future implementation rule:** When the application is built, all permission checks (API, frontend) must pass through a single centralized utility that reads the boolean columns. Direct column access or role‑based checks are forbidden outside that utility.

The schema design phase must account for:

- One `org_members` row per team member containing all permission columns
- 39 boolean columns — one per toggle in the full permission matrix
- Efficient permission lookup on every API request (single row read)
- RLS policies that respect both `org_id` and individual permission flags
- `assigned_to UUID` column on conversations, opportunities, jobs, and appointments for scoped Member access (single assignee — no join table)

> **Note:** The Platform Owner has no row in `org_members`. Super admin access is enforced entirely at the server route level via session middleware — not via the database.

---

# 9. Implications for RLS Policies

```
Admin
→ Full access to all rows where org_id matches

Manager
→ Access to rows where org_id matches
→ Further restricted by their individual permission toggles
→ Enforced at API route level and RLS level

Member
→ Access to rows where org_id matches AND assigned_to = their user_id
→ For modules where they have any access at all
→ Enforced at API route level and RLS level

Platform Owner (Super Admin)
→ Never authenticated through Supabase Auth
→ Never subject to RLS policies
→ Accesses database exclusively through /jafar server routes using the service role
→ Has no org_id — cannot appear in any org-scoped query
```

---

_Roles & Access Matrix v2 — Approved_ _All issues resolved. Opportunity/Job terminology aligned. Ready for Master Domain Architecture._
