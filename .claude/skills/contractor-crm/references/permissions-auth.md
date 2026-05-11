# Permissions & Auth Reference

Cross-reference: Roles & Access Matrix v2, RLS Policy Matrix v1, Master Domain Architecture v1.

---

## Table of Contents

1. Role Definitions
2. Permission Model (40 Booleans)
3. Full Permission Matrix with Defaults
4. Role Template Defaults
5. Account Creation Flows
6. JWT Structure
7. RLS Architecture Contract
8. RLS Helper Functions
9. Belt-and-Suspenders Tables
10. Service-Role-Only Tables
11. API Middleware Permission Pattern
12. Navigation Rendering Rules
13. Platform Owner / /jafar Isolation

---

## 1. Role Definitions

| Role      | Who They Are                         | Created By                     |
| --------- | ------------------------------------ | ------------------------------ |
| Admin     | The contractor — organization owner  | Platform Owner via `/jafar`    |
| Manager   | Office staff, operations lead        | Admin via Team Settings        |
| Member    | Field worker, technician, crew       | Admin via Team Settings        |

Admin always has full access. No toggles shown. Cannot be restricted.

---

## 2. Permission Model (40 Booleans)

- 40 boolean columns directly on `org_members` — no separate permissions table
- All NOT NULL — always TRUE or FALSE, never NULL (three-state booleans are forbidden)
- Boolean columns are the SOLE source of truth for runtime access control
- The `role` column is for UI template display and re-application only — NEVER used at runtime
- All permission checks (API, frontend, RLS) must go through a single centralized
  permission utility. Direct boolean column reads scattered across the codebase are forbidden

**Seeding rules:**
- Admin: all 40 columns seeded TRUE at creation
- Manager/Member: all 40 columns seeded from role template as explicit TRUE or FALSE
- Admin can override individual toggles after applying a template
- DEFAULT FALSE on schema is a safety net only — application code seeds explicit values

---

## 3. Full Permission Matrix with Defaults

### Dashboard (Module 1)
| Permission                   | Admin   | Manager | Member |
| ---------------------------- | ------- | ------- | ------ |
| `can_view_dashboard`         | Always  | ON      | ON     |
| `can_view_revenue`           | Always  | ON      | OFF    |
| `can_view_pipeline_snapshot` | Always  | ON      | OFF    |

### Inbox (Module 2)
| Permission                        | Admin   | Manager | Member |
| --------------------------------- | ------- | ------- | ------ |
| `can_view_all_conversations`      | Always  | ON      | OFF    |
| `can_view_assigned_conversations` | Always  | ON      | ON     |
| `can_send_messages`               | Always  | ON      | ON     |
| `can_delete_conversations`        | Always  | OFF     | OFF    |

### Contacts (Module 3)
| Permission             | Admin   | Manager | Member |
| ---------------------- | ------- | ------- | ------ |
| `can_view_all_contacts`| Always  | ON      | OFF    |
| `can_create_contacts`  | Always  | ON      | OFF    |
| `can_edit_contacts`    | Always  | ON      | OFF    |
| `can_delete_contacts`  | Always  | OFF     | OFF    |

### Pipeline (Module 4)
| Permission                  | Admin   | Manager | Member |
| --------------------------- | ------- | ------- | ------ |
| `can_view_full_pipeline`    | Always  | ON      | OFF    |
| `can_move_pipeline_stages`  | Always  | ON      | OFF    |
| `can_create_opportunities`  | Always  | ON      | OFF    |

### Jobs (Module 4 cont.)
| Permission                 | Admin   | Manager | Member |
| -------------------------- | ------- | ------- | ------ |
| `can_view_assigned_jobs`   | Always  | ON      | ON     |

### Quotes (Module 5)
| Permission             | Admin   | Manager | Member |
| ---------------------- | ------- | ------- | ------ |
| `can_view_all_quotes`  | Always  | ON      | OFF    |
| `can_create_quotes`    | Always  | ON      | OFF    |
| `can_send_quotes`      | Always  | ON      | OFF    |
| `can_edit_quotes`      | Always  | ON      | OFF    |
| `can_delete_quotes`    | Always  | OFF     | OFF    |

### Invoices (Module 6)
| Permission               | Admin   | Manager | Member |
| ------------------------ | ------- | ------- | ------ |
| `can_view_all_invoices`  | Always  | ON      | OFF    |
| `can_create_invoices`    | Always  | ON      | OFF    |
| `can_send_invoices`      | Always  | ON      | OFF    |
| `can_record_payments`    | Always  | ON      | OFF    |
| `can_delete_invoices`    | Always  | OFF     | OFF    |

### Appointments (Module 7)
| Permission                       | Admin   | Manager | Member |
| -------------------------------- | ------- | ------- | ------ |
| `can_view_all_appointments`      | Always  | ON      | OFF    |
| `can_view_assigned_appointments` | Always  | ON      | ON     |
| `can_create_appointments`        | Always  | ON      | OFF    |
| `can_reschedule_appointments`    | Always  | ON      | OFF    |

### Reputation (Module 8)
| Permission                    | Admin   | Manager | Member |
| ----------------------------- | ------- | ------- | ------ |
| `can_view_reviews`            | Always  | ON      | OFF    |
| `can_send_review_requests`    | Always  | ON      | OFF    |
| `can_view_negative_feedback`  | Always  | ON      | OFF    |

### Growth Feed (Module 9)
| Permission              | Admin   | Manager | Member |
| ----------------------- | ------- | ------- | ------ |
| `can_view_growth_feed`  | Always  | ON      | OFF    |

### Files & Media (Module 10)
| Permission             | Admin   | Manager | Member |
| ---------------------- | ------- | ------- | ------ |
| `can_view_all_files`   | Always  | ON      | OFF    |
| `can_upload_files`     | Always  | ON      | ON     |
| `can_delete_files`     | Always  | OFF     | OFF    |

### Team Management (Module 11)
| Permission                | Admin   | Manager | Member |
| ------------------------- | ------- | ------- | ------ |
| `can_view_team_members`   | Always  | ON      | OFF    |
| `can_create_team_members` | Always  | OFF     | OFF    |
| `can_edit_team_members`   | Always  | OFF     | OFF    |
| `can_delete_team_members` | Always  | OFF     | OFF    |

### Admin-Only Sections (No Toggles — Permanently Restricted)
| Section                   | Admin   | Manager | Member |
| ------------------------- | ------- | ------- | ------ |
| Organization settings     | Always  | NEVER   | NEVER  |
| Branding settings         | Always  | NEVER   | NEVER  |
| Billing & subscription    | Always  | NEVER   | NEVER  |
| Integrations              | Always  | NEVER   | NEVER  |
| Automation settings       | Always  | NEVER   | NEVER  |

---

## 4. Role Template Defaults

### Manager Template (Quick Reference)
```
Full dashboard with revenue + pipeline | All conversations + send
View/create/edit contacts (no delete) | Full pipeline + create opportunities
View all + assigned jobs | View/create/send/edit quotes (no delete)
View/create/send invoices + record payments (no delete)
View/create/reschedule all appointments | Full reputation access
View growth feed | View/upload files (no delete) | View team list only
No settings/billing access
```

### Member Template (Quick Reference)
```
Dashboard only (no revenue, no pipeline) | Assigned conversations + send
No contact access | No pipeline access | Assigned jobs only
No quote access | No invoice access | Assigned appointments only
No reputation access | No growth feed | Upload files only (no view all, no delete)
No team management | No settings/billing
```

---

## 5. Account Creation Flows

### Admin Account (Platform Owner creates via /jafar)
```
Platform Owner → /jafar → creates org + Admin auth user
→ sets temporary password, shares via secure channel
→ Contractor logs in → forced password change
→ All 40 permission booleans seeded as TRUE
```

### Team Member Account (Admin creates via Team Settings)
```
Admin → Team Settings → Add Team Member
→ Enter: full name, email, password
→ Set permissions via toggles or template button
→ Save
→ Auth user creation + org_members row + permission seeding must be atomic
→ If permission initialization fails after Auth user created,
  clean up the partial state (delete Auth user or partial records)
→ No email sent, no invite link — Admin shares credentials directly
```

---

## 6. JWT Structure

Injected via `app_metadata` at account creation using
`supabase.auth.admin.updateUserById()`:

```json
{
  "app_metadata": {
    "org_id": "<uuid>",
    "role": "admin | manager | member"
  }
}
```

- `org_id` is used by RLS for tenant isolation
- `role` is for coarse UI awareness ONLY — never for permission checks
- The 40 permission booleans are NEVER in the JWT — too large, stale immediately on change
- org_id must be injected before any RLS policy works

---

## 7. RLS Architecture Contract

The responsibility split is absolute:

**RLS enforces (database level):**
- `org_id` tenant isolation on every table
- Assignment scoping on 4 tables (belt-and-suspenders)
- Soft-delete protection (`AND deleted_at IS NULL`) on all applicable tables
- Baseline: users can only see their own org's data

**API middleware enforces (application level):**
- All 40 fine-grained permission checks
- Business rule authorization
- Feature-level access rules
- Assignment-aware visibility (`assigned_to = user_id` for Members)

**Service role (SvelteKit server routes + /jafar):**
- Bypasses RLS through PostgreSQL session-level `SET row_security = off`
- Handles every `INSERT` / `UPDATE` / `DELETE`
- Never exposed to the browser client

**Mutation policy:**
No `INSERT` / `UPDATE` / `DELETE` RLS policies exist for contractor JWTs.
All mutations flow through SvelteKit server routes using the service role.
Contractor JWTs have SELECT-only policies.

---

## 8. RLS Helper Functions

### get_my_org_id()
Extracts `org_id` from JWT `app_metadata`. Zero DB round-trips — pure JWT parsing.
Returns NULL if claim absent → all `org_id = get_my_org_id()` predicates evaluate
FALSE → zero rows returned (correct failure mode).

```sql
CREATE OR REPLACE FUNCTION public.get_my_org_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT NULLIF(
    (auth.jwt() -> 'app_metadata' ->> 'org_id'), ''
  )::UUID;
$$;
```

### get_my_member_id()
Resolves calling user's `org_members.id` via `supabase_user_id = auth.uid()`.
Uses unique index for O(1) lookup. STABLE = evaluated once per statement.
Returns NULL if: no matching row, inactive (`is_active = FALSE`), or soft-deleted.

```sql
CREATE OR REPLACE FUNCTION public.get_my_member_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT id FROM public.org_members
  WHERE supabase_user_id = auth.uid()
    AND is_active = TRUE AND deleted_at IS NULL
  LIMIT 1;
$$;
```

Both functions: REVOKE ALL FROM PUBLIC, GRANT EXECUTE TO authenticated.

---

## 9. Belt-and-Suspenders Tables

Four tables have TWO permissive SELECT policies. PostgreSQL ORs them — a row matches
if EITHER policy passes.

| Table           | Policy A (full access)              | Policy B (assigned only)                 |
| --------------- | ----------------------------------- | ---------------------------------------- |
| `opportunities` | `can_view_full_pipeline = TRUE`     | `assigned_to = get_my_member_id()`       |
| `jobs`          | `can_view_full_pipeline = TRUE`     | `assigned_to = get_my_member_id()`       |
| `conversations` | `can_view_all_conversations = TRUE` | `assigned_to = get_my_member_id()` + `can_view_assigned_conversations = TRUE` |
| `appointments`  | `can_view_all_appointments = TRUE`  | `assigned_to = get_my_member_id()` + `can_view_assigned_appointments = TRUE` |

All policies include `org_id = get_my_org_id() AND deleted_at IS NULL`.
Policy A checks the boolean permission via subquery on `org_members`.
Policy B always checks `assigned_to = get_my_member_id()`.

---

## 10. Service-Role-Only Tables (Implicit Deny)

Four tables have RLS enabled but NO permissive policy for contractor JWTs.
PostgreSQL default = DENY when no permissive policy matches.

| Table                    | Reason                                          |
| ------------------------ | ----------------------------------------------- |
| `internal_activity_log`  | Agency-internal only — contractor access forbidden |
| `outbox_events`          | Transactional dispatch infra — not contractor-facing |
| `automation_jobs`        | BullMQ execution audit — workers only           |
| `org_counters`           | SELECT FOR UPDATE number generation — service role only |

---

## 11. API Middleware Permission Pattern

Every API route must follow this pattern:

```typescript
// 1. Authenticate — get session and org_id
const session = await getSession(event);
if (!session) return error(401);

// 2. Get member with permissions (single row read)
const member = await getMemberWithPermissions(session.user.id);
if (!member || !member.is_active) return error(403);

// 3. Check specific permission for this operation
if (!member.can_view_all_quotes) return error(403);

// 4. Execute query scoped by org_id from session (not request body)
const quotes = await db.select().from(quotesTable)
  .where(and(
    eq(quotesTable.org_id, member.org_id),
    isNull(quotesTable.deleted_at)
  ));
```

Key principles:
- `org_id` comes from the authenticated session — NEVER from the request body
- Permission check happens BEFORE any database query
- Use the centralized permission utility — never check booleans inline
- For Member-scoped access, add `assigned_to = member.id` filter

---

## 12. Navigation Rendering Rules

```
If user has no access to a module → module does not appear in navigation
Direct URL access to forbidden module → 403
No ghost links or locked icons shown
```

The `/jafar` route is never linked in app navigation.

---

## 13. Platform Owner / /jafar Isolation

- Platform Owner is NOT a contractor user — no `org_id`, no `org_members` row, no Supabase Auth record
- Credentials stored as environment variables only (`SUPER_ADMIN_EMAIL`, `SUPER_ADMIN_PASSWORD_HASH` bcrypt)
- Authentication: server-side check against env vars → signed httpOnly session cookie
- Session is completely isolated from all contractor sessions
- TOTP (time-based one-time password) REQUIRED for all /jafar logins
- All `/jafar/*` routes protected by super admin session middleware
- Uses service role for all database access — never subject to RLS
- Failed login attempts are rate-limited
- IP allowlisting strongly encouraged but not required in v1

### /jafar Routes In Scope
```
/jafar                   → Super Admin login page (no branding, no hints)
/jafar/dashboard         → Org list overview
/jafar/orgs/new          → Create new org + Admin account
/change-password         → Authenticated first-login password change prompt
```

### Platform Owner Capabilities
```
→ Create new contractor organizations
→ Create Admin accounts for those organizations
→ Set temporary passwords and share via secure channel
→ View all organizations (read-only list)
→ Update organization status (active / suspended)
→ View dead-lettered outbox events for operational follow-up
```
