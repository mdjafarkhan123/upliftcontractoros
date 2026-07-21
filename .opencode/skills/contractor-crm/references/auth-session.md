# Auth & Session Reference

How auth context, feature flags, quotas, and integration status flow
through hooks → API routes → client. This file is the source of truth
for `event.locals.auth`, `requireFeature`, the session API, and the
client poll loop.

Cross-reference: [[permissions-auth]], [[business-rules]].

---

## 1. Two Layers — Permissions vs Entitlements

| Layer             | Where it lives                                | Authority for                                       |
| ----------------- | --------------------------------------------- | --------------------------------------------------- |
| **Permissions**   | 40 booleans on `org_members`                  | Member-level access (per-user capabilities)         |
| **Feature flags** | 21 `feature_*` booleans on `organizations`    | Org-level entitlements (plan-based capabilities)    |
| **Quota limits**  | 6 `max_*` integers on `organizations`         | Org-level usage ceilings                            |
| **Usage**         | `org_usage` rows                              | Atomic current counters by org, metric, and period  |
| **Integrations**  | `integration_status` JSONB on `organizations` | External service readiness (Stripe connected, etc.) |

**Feature flags are NOT bypassed by Admin.** If an org has
`feature_stripe_payments = false`, the Admin of that org is still
blocked. Only Platform Owner (`/jafar`) can change feature flags.

`plan` column is **display-only**. Never gate on `plan` — always read
the feature flag.

Some flows require BOTH a feature flag AND an integration
status — e.g. "send invoice via Stripe" needs
`feature_stripe_payments = true` AND `integration_status.stripe_connected = true`.

Quota checks compare the relevant `organizations.max_*` limit against
`org_usage.value` for the matching `(org_id, metric, period_start_date)`.
Monthly metrics use the first day of the month as `period_start_date`.
Lifetime metrics use sentinel date `1900-01-01`.

---

## 2. AuthContext — The Single Source

Defined in `$lib/server/auth/loadAuthContext.ts`. One DB query per
request joins `org_members` and `organizations`. Returned shape:

```ts
type AuthContext = {
	supabaseUser: User;
	member: OrgMember;
	org: Org;
	orgId: string;
	permissions: OrgMember; // alias of member for readability
	featureFlags: FeatureFlags; // 21 feature_* booleans
	limits: OrgLimits; // 6 max_* integers
	integrationStatus: IntegrationStatus;
	orgStatus: 'active' | 'suspended' | 'pending_deletion' | 'deleted';
	featureOverridesUpdatedAt: Date | null;
};
```

**Never call `loadAuthContext()` directly from an API route.** Hooks
attach it to `event.locals.auth` — read it from there.

---

## 3. hooks.server.ts Contract

For every request:

1. Attaches `event.locals.supabase` and `event.locals.safeSession`.
2. Enforces `/jafar/*` and `/api/admin/*` super-admin gates.
3. For non-public paths, calls `loadAuthContext` and attaches
   `event.locals.auth`.

**Public paths (auth NOT loaded):**

- `/auth/*`
- `/jafar` and `/jafar/*`
- `/q/*`
- `/api/admin/*`
- `/api/webhooks/*`
- `/api/jafar/*`

**Redirect / 401 rules for non-public paths:**

- `/change-password` — requires auth, allows un-changed password
- `/api/*` — returns 401 JSON if no auth, 403 JSON if org suspended
- Everything else (app routes) — redirects to `/auth/login`,
  `/auth/suspended`, or `/change-password`

**Setup state is NOT a blocker.** If `org.is_setup_complete = false`,
the app renders a non-blocking banner in `(app)/+layout.svelte`. No
forced redirect to `/setup` (deprecated).

---

## 4. assertOrgActive

```ts
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';

export const POST: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth); // narrows auth from AuthContext|null → AuthContext
	// ...
};
```

Checks:

- auth is loaded
- `member.is_active`
- `orgStatus !== 'suspended'`
- `orgStatus !== 'pending_deletion'` and `!== 'deleted'`

Does NOT re-query the DB. Hooks already loaded the state.
Does NOT check `is_setup_complete`.

---

## 5. Feature Guards

```ts
import {
  requireFeature,
  requireWithinLimit,
  requireIntegration,
  hasFeature,
  hasIntegration
} from '$lib/server/auth/featureGuard';

// Pattern: permission first, then feature, then integration, then limit.
if (!auth.member.can_send_invoices) error(403);
requireFeature(auth, 'feature_stripe_payments');
requireIntegration(auth, 'stripe_connected');
const count = await db.select(...);
requireWithinLimit(auth, 'max_monthly_sms', count);
```

All three `require*` helpers throw `error(403, { code, ... })` with
structured codes:

- `FEATURE_DISABLED`
- `LIMIT_EXCEEDED`
- `INTEGRATION_NOT_CONNECTED`

UI surfaces these codes to show "Upgrade plan" / "Connect Stripe"
prompts instead of a generic 403.

---

## 6. Client Session

| Route                     | Method | Returns                                                    |
| ------------------------- | ------ | ---------------------------------------------------------- |
| `GET /api/session`        | GET    | `{ org, member, featureFlags, limits, integrationStatus }` |
| `GET /api/session/status` | GET    | `{ status, feature_overrides_updated_at }`                 |

`/api/session` strips internal fields from `org` (no Stripe keys,
no Twilio number) — safe to expose to the browser.

`/(app)/+layout.ts` calls `fetch('/api/session')` in its `load()` and
hands the result to `+layout.svelte`. The layout sets four contexts:

- `setOrgContext`
- `setMemberContext`
- `setFeatureFlagsContext`
- `setLimitsContext`
- `setIntegrationStatusContext`

Components read them via the corresponding `get*Context()` helpers.

---

## 7. Status Poll (20-minute interval)

`(app)/+layout.svelte` runs `setInterval(pollStatus, 20 * 60 * 1000)`.
Each tick GETs `/api/session/status` and:

1. If `status === 'suspended'` → `goto('/auth/suspended')`.
2. If `feature_overrides_updated_at` differs from the last value →
   refetch `/api/session` and replace the in-memory `session` state.
   All feature-flag-gated UI reactively updates.

No websocket / Realtime. The 20-minute lag is the worst case before a
plan change reaches a logged-in user.

---

## 8. Navigation Gating

`buildVisibleNav(member, featureFlags)` hides a nav item when EITHER:

- the relevant permission is FALSE, or
- the relevant feature flag is FALSE.

| Nav item     | Feature flag              |
| ------------ | ------------------------- |
| Inbox        | `feature_conversations`   |
| Quotes       | `feature_financial_tools` |
| Invoices     | `feature_financial_tools` |
| Appointments | `feature_appointments`    |
| Growth       | `feature_growth_feed`     |

Dashboard, Contacts, Pipeline, Jobs, Reputation have no feature flag
in v1 (always available if permission allows).

---

## 9. /jafar Bypass

Platform Owner reaches `event.locals.auth = null` because `/jafar/*`
is a public prefix. `/jafar` uses its own session via
`getJafarSession()`. Feature flags do not apply in `/jafar`. This is
the only layer that can write `feature_*` columns.

When `/jafar` updates feature flags it MUST also set:

- `feature_overrides_updated_at = now()`
- `feature_flags_updated_by = <admin member id of the org>` (or null)

These two columns drive the client poll's "refresh now" signal.
