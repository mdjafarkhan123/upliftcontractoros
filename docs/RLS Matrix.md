# RLS Policy Matrix — Contractor Growth Operating System

**Version:** 1.0  
**Date:** May 2026  
**Depends:** Core Schema Design v1, Roles & Access Matrix v2, Master Domain Architecture v1

---

## How to Deploy

Run this file once, after the Core Schema Design migration has been applied. It is idempotent — safe to re-run via `CREATE OR REPLACE` on the helper functions and `DROP POLICY IF EXISTS` before each `CREATE POLICY` if you need to reset.

## Architecture Contract

_(Master Domain Architecture v1, Rule 27)_

**RLS enforces:**

- `org_id` tenant isolation on every table (primary mandate)
- Assignment scoping on 4 tables (belt-and-suspenders)

**API middleware enforces:**

- All 39 fine-grained permission checks
- Business rule authorization
- Feature-level access rules

**Service role (SvelteKit server routes + /jafar):**

- Bypasses RLS through PostgreSQL `BYPASSRLS` privilege
- Handles every `INSERT` / `UPDATE` / `DELETE`
- Never exposed to the browser client

**Platform Owner (/jafar):**

- Has no Supabase Auth identity
- Has no `org_id` and no `org_members` row
- Accesses the DB exclusively through `/jafar` server routes using the service role — never subject to any RLS policy

## JWT Structure

_(Injected via `app_metadata` at account creation)_

```json
{
  "app_metadata": {
    "org_id": "<uuid>",
    "role":   "admin" | "manager" | "member"
  }
}
```

## Permission Source of Truth

The 39 boolean columns on `org_members` are the sole authority for fine-grained access. The JWT `role` field is for UI display only and is NEVER used in RLS expressions. RLS policies that go beyond `org_id` isolation read the boolean columns directly via subquery — not the role column.

## Mutation Policy

No `INSERT` / `UPDATE` / `DELETE` policies are written for contractor JWTs. All mutations flow through SvelteKit server routes using the service role. The absence of a permissive mutation policy means contractor JWTs are implicitly denied for all writes — this is the desired behavior.

---

## Section 0 — Helper Functions

Two `STABLE SECURITY DEFINER` functions are the foundation of every policy in this file. `STABLE` tells the PostgreSQL query planner that the function returns the same value for the duration of a single statement, allowing it to be evaluated once per query (initplan hoisting) rather than once per row.

`SECURITY DEFINER` ensures the function runs with the privileges of its definer (postgres / service role) and that `SET search_path = public` prevents search-path injection.

### get_my_org_id()

Extracts `org_id` from the JWT `app_metadata` claim. Zero database round-trips — pure JWT parsing. Returns `NULL` if the claim is absent or empty, which causes every `org_id = get_my_org_id()` predicate to evaluate `FALSE`, denying access to any row. This is the correct failure mode.

```sql
CREATE OR REPLACE FUNCTION public.get_my_org_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NULLIF(
    (auth.jwt() -> 'app_metadata' ->> 'org_id'),
    ''
  )::UUID;
$$;
```

### get_my_member_id()

Resolves the calling user's `org_members.id` by matching `supabase_user_id = auth.uid()`.

This bridges the gap between Supabase Auth identity (`auth.users.id`, what `auth.uid()` returns) and the application identity (`org_members.id`, what `assigned_to` and `member_id` FKs reference throughout the schema).

Uses the unique index `idx_org_members_supabase_user_id` for a single O(1) lookup. `STABLE` allows the planner to execute this once per statement, not once per row.

Returns `NULL` if:

- No matching `org_members` row exists
- The member is inactive (`is_active = FALSE`)
- The member has been soft-deleted (`deleted_at IS NOT NULL`)

A `NULL` return causes all `assigned_to = get_my_member_id()` predicates to evaluate `FALSE` — correct behavior for deactivated or deleted accounts.

```sql
CREATE OR REPLACE FUNCTION public.get_my_member_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id
  FROM public.org_members
  WHERE supabase_user_id = auth.uid()
    AND is_active        = TRUE
    AND deleted_at       IS NULL
  LIMIT 1;
$$;
```

### Permissions Hardening

```sql
-- Hardened EXECUTE permissions — only authenticated users may call these
REVOKE ALL ON FUNCTION public.get_my_org_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_my_member_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_org_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_member_id() TO authenticated;
```

---

## Section 1 — Enable RLS on all 30 Tables

`ENABLE ROW LEVEL SECURITY` activates RLS on the table. `FORCE ROW LEVEL SECURITY` extends RLS enforcement to the table owner as well, removing any ownership-based bypass.

The Supabase service role bypasses RLS via the session-level `SET row_security = off` mechanism — `FORCE` does not affect it. `FORCE` is purely defensive: it closes the table-owner bypass that could otherwise exist in non-Supabase PostgreSQL setups.

```sql
-- Domain 1 — Organization & Identity
ALTER TABLE public.organizations             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizations             FORCE  ROW LEVEL SECURITY;
ALTER TABLE public.org_members               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_members               FORCE  ROW LEVEL SECURITY;
ALTER TABLE public.automation_settings       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_settings       FORCE  ROW LEVEL SECURITY;

-- Domain 2 — Contacts
ALTER TABLE public.contacts                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contacts                  FORCE  ROW LEVEL SECURITY;
ALTER TABLE public.contact_addresses         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_addresses         FORCE  ROW LEVEL SECURITY;
ALTER TABLE public.contact_notes             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_notes             FORCE  ROW LEVEL SECURITY;

-- Domain 3 — Pipeline
ALTER TABLE public.pipeline_stages           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pipeline_stages           FORCE  ROW LEVEL SECURITY;
ALTER TABLE public.opportunities             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.opportunities             FORCE  ROW LEVEL SECURITY;

-- Domain 4 — Jobs
ALTER TABLE public.jobs                      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jobs                      FORCE  ROW LEVEL SECURITY;

-- Domain 5 — Communication
ALTER TABLE public.conversations             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations             FORCE  ROW LEVEL SECURITY;
ALTER TABLE public.messages                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages                  FORCE  ROW LEVEL SECURITY;

-- Domain 6 — Revenue
ALTER TABLE public.quotes                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotes                    FORCE  ROW LEVEL SECURITY;
ALTER TABLE public.quote_line_items          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_line_items          FORCE  ROW LEVEL SECURITY;
ALTER TABLE public.quote_views               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_views               FORCE  ROW LEVEL SECURITY;
ALTER TABLE public.quote_templates           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_templates           FORCE  ROW LEVEL SECURITY;
ALTER TABLE public.quote_template_line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_template_line_items FORCE  ROW LEVEL SECURITY;
ALTER TABLE public.invoices                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices                  FORCE  ROW LEVEL SECURITY;
ALTER TABLE public.invoice_line_items        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_line_items        FORCE  ROW LEVEL SECURITY;
ALTER TABLE public.payments                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments                  FORCE  ROW LEVEL SECURITY;

-- Domain 7 — Appointments
ALTER TABLE public.appointments              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments              FORCE  ROW LEVEL SECURITY;

-- Domain 8 — Reputation
ALTER TABLE public.review_requests           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_requests           FORCE  ROW LEVEL SECURITY;
ALTER TABLE public.reviews                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviews                   FORCE  ROW LEVEL SECURITY;
ALTER TABLE public.private_feedback          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.private_feedback          FORCE  ROW LEVEL SECURITY;

-- Domain 9 — Files & Media
ALTER TABLE public.media                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.media                     FORCE  ROW LEVEL SECURITY;

-- Domain 10 — Growth, Automation & System
ALTER TABLE public.growth_feed_items         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.growth_feed_items         FORCE  ROW LEVEL SECURITY;
ALTER TABLE public.internal_activity_log     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.internal_activity_log     FORCE  ROW LEVEL SECURITY;
ALTER TABLE public.notifications             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications             FORCE  ROW LEVEL SECURITY;
ALTER TABLE public.automation_jobs           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_jobs           FORCE  ROW LEVEL SECURITY;
ALTER TABLE public.outbox_events             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outbox_events             FORCE  ROW LEVEL SECURITY;
ALTER TABLE public.org_counters              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_counters              FORCE  ROW LEVEL SECURITY;
```

---

## Section 2 — Service-Role-Only Tables (Implicit Deny)

Four tables have RLS ENABLED (Section 1) but carry NO permissive policy for contractor JWTs. PostgreSQL's default when no permissive policy matches is `DENY`.

Any contractor JWT attempting `SELECT`, `INSERT`, `UPDATE`, or `DELETE` on these tables will receive zero rows on `SELECT` and a permission error on writes. The service role bypasses RLS at the session level and retains full access.

| Table                   | Reason                                                                              |
| :---------------------- | :---------------------------------------------------------------------------------- |
| `internal_activity_log` | Agency-internal only. Contractor access is explicitly forbidden in the domain arch. |
| `outbox_events`         | Transactional dispatch infra. Never a contractor-facing table.                      |
| `automation_jobs`       | BullMQ execution audit trail. Read/write by workers only.                           |
| `org_counters`          | `SELECT FOR UPDATE` number generation — service role only.                          |

**NO SQL BLOCKS FOLLOW FOR THESE FOUR TABLES.** The absence of a permissive policy IS the policy.

---

## Section 3 — Domain 1: Organization & Identity

### organizations

Every contractor user needs to read their own org record to populate the app shell (org name, logo, timezone, plan, primary color, status). No other org's record is ever accessible. All writes flow through server routes via service role.

```sql
DROP POLICY IF EXISTS "organizations: members select own org" ON public.organizations;
CREATE POLICY "organizations: members select own org"
ON public.organizations
FOR SELECT
TO authenticated
USING (id = public.get_my_org_id());
```

### org_members

All active org members may `SELECT` the full roster of their organization, including each other's permission booleans. Rationale: every member must be able to read their OWN row to resolve their 39 permission booleans on the client. Fine-grained team visibility (`can_view_team_members`) is enforced at the API layer.

```sql
DROP POLICY IF EXISTS "org_members: members select own org roster" ON public.org_members;
CREATE POLICY "org_members: members select own org roster"
ON public.org_members
FOR SELECT
TO authenticated
USING (org_id = public.get_my_org_id());
```

### automation_settings

One row per org. All org members may read the automation settings row (needed for UI display of active automations). Only Admin may modify settings — enforced at the API layer.

```sql
DROP POLICY IF EXISTS "automation_settings: members select own org settings" ON public.automation_settings;
CREATE POLICY "automation_settings: members select own org settings"
ON public.automation_settings
FOR SELECT
TO authenticated
USING (org_id = public.get_my_org_id());
```

---

## Section 4 — Domain 2: Contacts

Contact access is governed by four permission booleans: `can_view_all_contacts`, `can_create_contacts`, `can_edit_contacts`, `can_delete_contacts`. By default, Members have no contact access. The API layer denies Members before any DB query is constructed. RLS provides the `org_id` isolation floor.

```sql
-- ── contacts ───────────────────────────────────────────────
DROP POLICY IF EXISTS "contacts: members select own org contacts" ON public.contacts;
CREATE POLICY "contacts: members select own org contacts"
ON public.contacts
FOR SELECT
TO authenticated
USING (org_id = public.get_my_org_id());

-- ── contact_addresses ──────────────────────────────────────
DROP POLICY IF EXISTS "contact_addresses: members select own org addresses" ON public.contact_addresses;
CREATE POLICY "contact_addresses: members select own org addresses"
ON public.contact_addresses
FOR SELECT
TO authenticated
USING (org_id = public.get_my_org_id());

-- ── contact_notes ──────────────────────────────────────────
DROP POLICY IF EXISTS "contact_notes: members select own org notes" ON public.contact_notes;
CREATE POLICY "contact_notes: members select own org notes"
ON public.contact_notes
FOR SELECT
TO authenticated
USING (org_id = public.get_my_org_id());
```

---

## Section 5 — Domain 3: Pipeline

### pipeline_stages

Pipeline stages must be readable by all org members. Write operations are Admin-only, enforced at the API layer.

```sql
DROP POLICY IF EXISTS "pipeline_stages: members select own org stages" ON public.pipeline_stages;
CREATE POLICY "pipeline_stages: members select own org stages"
ON public.pipeline_stages
FOR SELECT
TO authenticated
USING (org_id = public.get_my_org_id());
```

### opportunities — Belt-and-Suspenders

Two permissive `SELECT` policies. PostgreSQL `OR`s permissive policies — a row is accessible if EITHER policy matches.

**POLICY A — Full pipeline access:** Granted when `can_view_full_pipeline = TRUE`.
**POLICY B — Assigned access only:** Any member may select an opportunity row where they are the direct assignee.

```sql
DROP POLICY IF EXISTS "opportunities: full pipeline access" ON public.opportunities;
CREATE POLICY "opportunities: full pipeline access"
ON public.opportunities
FOR SELECT
TO authenticated
USING (
  org_id = public.get_my_org_id()
  AND (
    SELECT can_view_full_pipeline
    FROM   public.org_members
    WHERE  supabase_user_id = auth.uid()
      AND  is_active        = TRUE
      AND  deleted_at       IS NULL
    LIMIT 1
  ) = TRUE
);

DROP POLICY IF EXISTS "opportunities: assigned member access" ON public.opportunities;
CREATE POLICY "opportunities: assigned member access"
ON public.opportunities
FOR SELECT
TO authenticated
USING (
  org_id      = public.get_my_org_id()
  AND assigned_to = public.get_my_member_id()
);
```

---

## Section 6 — Domain 4: Jobs

### jobs — Belt-and-Suspenders

Mirroring the opportunities pattern. `POLICY A` uses `can_view_full_pipeline` as the proxy for full job list access. `POLICY B` allows field Members to see jobs where `assigned_to` matches their member ID.

```sql
DROP POLICY IF EXISTS "jobs: full job list access" ON public.jobs;
CREATE POLICY "jobs: full job list access"
ON public.jobs
FOR SELECT
TO authenticated
USING (
  org_id = public.get_my_org_id()
  AND (
    SELECT can_view_full_pipeline
    FROM   public.org_members
    WHERE  supabase_user_id = auth.uid()
      AND  is_active        = TRUE
      AND  deleted_at       IS NULL
    LIMIT 1
  ) = TRUE
);

DROP POLICY IF EXISTS "jobs: assigned member access" ON public.jobs;
CREATE POLICY "jobs: assigned member access"
ON public.jobs
FOR SELECT
TO authenticated
USING (
  org_id      = public.get_my_org_id()
  AND assigned_to = public.get_my_member_id()
);
```

---

## Section 7 — Domain 5: Communication

### conversations — Belt-and-Suspenders

`POLICY A` grants full inbox access via `can_view_all_conversations`. `POLICY B` grants assigned access only if `can_view_assigned_conversations` is `TRUE`.

```sql
DROP POLICY IF EXISTS "conversations: full inbox access" ON public.conversations;
CREATE POLICY "conversations: full inbox access"
ON public.conversations
FOR SELECT
TO authenticated
USING (
  org_id = public.get_my_org_id()
  AND (
    SELECT can_view_all_conversations
    FROM   public.org_members
    WHERE  supabase_user_id = auth.uid()
      AND  is_active        = TRUE
      AND  deleted_at       IS NULL
    LIMIT 1
  ) = TRUE
);

DROP POLICY IF EXISTS "conversations: assigned member access" ON public.conversations;
CREATE POLICY "conversations: assigned member access"
ON public.conversations
FOR SELECT
TO authenticated
USING (
  org_id      = public.get_my_org_id()
  AND assigned_to = public.get_my_member_id()
  AND (
    SELECT can_view_assigned_conversations
    FROM   public.org_members
    WHERE  supabase_user_id = auth.uid()
      AND  is_active        = TRUE
      AND  deleted_at       IS NULL
    LIMIT 1
  ) = TRUE
);
```

### messages

`org_id` isolation only. Member assignment filtering is enforced at the API layer on every message query and message-send route.

```sql
DROP POLICY IF EXISTS "messages: members select own org messages" ON public.messages;
CREATE POLICY "messages: members select own org messages"
ON public.messages
FOR SELECT
TO authenticated
USING (org_id = public.get_my_org_id());
```

---

## Section 8 — Domain 6: Revenue

Financial data is governed by module-specific permission booleans. Members have no access by default.

```sql
-- ── quotes ─────────────────────────────────────────────────
DROP POLICY IF EXISTS "quotes: members select own org quotes" ON public.quotes;
CREATE POLICY "quotes: members select own org quotes"
ON public.quotes
FOR SELECT
TO authenticated
USING (org_id = public.get_my_org_id());

-- ── quote_line_items ───────────────────────────────────────
DROP POLICY IF EXISTS "quote_line_items: members select own org line items" ON public.quote_line_items;
CREATE POLICY "quote_line_items: members select own org line items"
ON public.quote_line_items
FOR SELECT
TO authenticated
USING (org_id = public.get_my_org_id());

-- ── quote_views ────────────────────────────────────────────
DROP POLICY IF EXISTS "quote_views: members select own org quote views" ON public.quote_views;
CREATE POLICY "quote_views: members select own org quote views"
ON public.quote_views
FOR SELECT
TO authenticated
USING (org_id = public.get_my_org_id());

-- ── quote_templates ────────────────────────────────────────
DROP POLICY IF EXISTS "quote_templates: members select own org templates" ON public.quote_templates;
CREATE POLICY "quote_templates: members select own org templates"
ON public.quote_templates
FOR SELECT
TO authenticated
USING (org_id = public.get_my_org_id());

-- ── quote_template_line_items ──────────────────────────────
DROP POLICY IF EXISTS "quote_template_line_items: members select own org template items" ON public.quote_template_line_items;
CREATE POLICY "quote_template_line_items: members select own org template items"
ON public.quote_template_line_items
FOR SELECT
TO authenticated
USING (org_id = public.get_my_org_id());

-- ── invoices ───────────────────────────────────────────────
DROP POLICY IF EXISTS "invoices: members select own org invoices" ON public.invoices;
CREATE POLICY "invoices: members select own org invoices"
ON public.invoices
FOR SELECT
TO authenticated
USING (org_id = public.get_my_org_id());

-- ── invoice_line_items ─────────────────────────────────────
DROP POLICY IF EXISTS "invoice_line_items: members select own org line items" ON public.invoice_line_items;
CREATE POLICY "invoice_line_items: members select own org line items"
ON public.invoice_line_items
FOR SELECT
TO authenticated
USING (org_id = public.get_my_org_id());

-- ── payments ───────────────────────────────────────────────
DROP POLICY IF EXISTS "payments: members select own org payments" ON public.payments;
CREATE POLICY "payments: members select own org payments"
ON public.payments
FOR SELECT
TO authenticated
USING (org_id = public.get_my_org_id());
```

---

## Section 9 — Domain 7: Appointments

### appointments — Belt-and-Suspenders

`POLICY A` grants full access via `can_view_all_appointments`. `POLICY B` grants assigned access only if `can_view_assigned_appointments` is `TRUE`.

```sql
DROP POLICY IF EXISTS "appointments: full appointment list access" ON public.appointments;
CREATE POLICY "appointments: full appointment list access"
ON public.appointments
FOR SELECT
TO authenticated
USING (
  org_id = public.get_my_org_id()
  AND (
    SELECT can_view_all_appointments
    FROM   public.org_members
    WHERE  supabase_user_id = auth.uid()
      AND  is_active        = TRUE
      AND  deleted_at       IS NULL
    LIMIT 1
  ) = TRUE
);

DROP POLICY IF EXISTS "appointments: assigned member access" ON public.appointments;
CREATE POLICY "appointments: assigned member access"
ON public.appointments
FOR SELECT
TO authenticated
USING (
  org_id      = public.get_my_org_id()
  AND assigned_to = public.get_my_member_id()
  AND (
    SELECT can_view_assigned_appointments
    FROM   public.org_members
    WHERE  supabase_user_id = auth.uid()
      AND  is_active        = TRUE
      AND  deleted_at       IS NULL
    LIMIT 1
  ) = TRUE
);
```

---

## Section 10 — Domain 8: Reputation

Reputation module permissions are enforced at the API layer. RLS provides the `org_id` isolation floor.

```sql
-- ── review_requests ────────────────────────────────────────
DROP POLICY IF EXISTS "review_requests: members select own org review requests" ON public.review_requests;
CREATE POLICY "review_requests: members select own org review requests"
ON public.review_requests
FOR SELECT
TO authenticated
USING (org_id = public.get_my_org_id());

-- ── reviews ────────────────────────────────────────────────
DROP POLICY IF EXISTS "reviews: members select own org reviews" ON public.reviews;
CREATE POLICY "reviews: members select own org reviews"
ON public.reviews
FOR SELECT
TO authenticated
USING (org_id = public.get_my_org_id());

-- ── private_feedback ───────────────────────────────────────
DROP POLICY IF EXISTS "private_feedback: members select own org feedback" ON public.private_feedback;
CREATE POLICY "private_feedback: members select own org feedback"
ON public.private_feedback
FOR SELECT
TO authenticated
USING (org_id = public.get_my_org_id());
```

---

## Section 11 — Domain 9: Files & Media

### media

Media rows are metadata; actual files live in Cloudflare R2. Access to objects is controlled by pre-signed URLs. RLS protects the metadata row.

```sql
DROP POLICY IF EXISTS "media: members select own org media metadata" ON public.media;
CREATE POLICY "media: members select own org media metadata"
ON public.media
FOR SELECT
TO authenticated
USING (org_id = public.get_my_org_id());
```

---

## Section 12 — Domain 10: Growth, Automation & System

### growth_feed_items

```sql
DROP POLICY IF EXISTS "growth_feed_items: members select own org feed" ON public.growth_feed_items;
CREATE POLICY "growth_feed_items: members select own org feed"
ON public.growth_feed_items
FOR SELECT
TO authenticated
USING (org_id = public.get_my_org_id());
```

### notifications

The tightest row-level scoping: each member sees ONLY their own notification rows.

```sql
DROP POLICY IF EXISTS "notifications: members select own notifications only" ON public.notifications;
CREATE POLICY "notifications: members select own notifications only"
ON public.notifications
FOR SELECT
TO authenticated
USING (member_id = public.get_my_member_id());
```

---

## Section 13 — Outbox pg_notify Trigger

Wakes the outbox worker immediately on every `INSERT` into `outbox_events`.

```sql
CREATE OR REPLACE FUNCTION public.notify_outbox_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM pg_notify('outbox_channel', NEW.id::text);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS outbox_notify ON public.outbox_events;

CREATE TRIGGER outbox_notify
AFTER INSERT ON public.outbox_events
FOR EACH ROW
EXECUTE FUNCTION public.notify_outbox_insert();
```

---

## Section 14 — Complete Policy Reference Table

| Table                   | SELECT        | MUTATIONS | NOTES                              |
| :---------------------- | :------------ | :-------- | :--------------------------------- |
| `organizations`         | org-scoped    | SVC only  | `id = my org`                      |
| `org_members`           | org-scoped    | SVC only  | API filters team perm              |
| `automation_settings`   | org-scoped    | SVC only  | Admin-only via API                 |
| `contacts`              | org-scoped    | SVC only  | API checks `can_view_all_contacts` |
| `pipeline_stages`       | org-scoped    | SVC only  |                                    |
| `opportunities`         | B&S (2 pol.)  | SVC only  | full OR assigned_to                |
| `jobs`                  | B&S (2 pol.)  | SVC only  | full OR assigned_to                |
| `conversations`         | B&S (2 pol.)  | SVC only  | full OR assigned + bool check      |
| `messages`              | org-scoped    | SVC only  | Decision 4: org only               |
| `quotes`                | org-scoped    | SVC only  | API checks `can_view_all_quotes`   |
| `invoices`              | org-scoped    | SVC only  | API checks `can_view_all_invoices` |
| `payments`              | org-scoped    | SVC only  | Immutable financial record         |
| `appointments`          | B&S (2 pol.)  | SVC only  | full OR assigned + bool check      |
| `notifications`         | member-scoped | SVC only  | `member_id = get_my_member_id()`   |
| `internal_activity_log` | DENY          | DENY      | Service-role-only                  |

### Key

- **org-scoped:** Permissive SELECT: `org_id = get_my_org_id()`
- **B&S (2 pol.):** Belt-and-suspenders: Policy A (full access) OR Policy B (assigned access)
- **member-scoped:** Permissive SELECT: `member_id = get_my_member_id()`
- **SVC only:** No contractor JWT policy written; service role handles all mutations
- **DENY:** RLS enabled, no permissive policy → implicit deny for all contractor JWTs

---

**END OF RLS POLICY MATRIX v1.0**
