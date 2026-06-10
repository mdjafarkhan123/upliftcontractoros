# Performance Audit — ContractorOS

**Date:** 2026-06-10
**Scope:** Full codebase — API layer, database access, connection handling, workers/queues, cron, frontend stores, bundle, deployment configuration.
**Architecture:** SvelteKit (CSR-only) on Vercel serverless · Supabase Postgres (PgBouncer transaction pooler :6543 for serverless, direct/session :5432 for worker) · standalone Railway worker (BullMQ + Redis, LISTEN/NOTIFY outbox) · Cloudflare R2 media · Supabase Realtime.

---

## Summary of what is already good

Before the findings: this codebase is in much better shape than most. These patterns are already correct and should not be touched:

- **Outbox worker** — LISTEN/NOTIFY wake-up + `FOR UPDATE SKIP LOCKED` batch claim + external calls outside transactions + deterministic BullMQ `jobId` dedup. Textbook implementation.
- **Conversation detail endpoint** — single `LEFT JOIN LATERAL` query for conversation + contact + latest quote/invoice/stage/appointment. One round trip where naive code would do six.
- **Inbox & dashboard stores** — per-filter-key SWR caching, abort controllers, throttled realtime revalidation, optimistic updates with rollback. No refetch storms.
- **Cursor pagination everywhere** — no OFFSET pagination found anywhere.
- **Index coverage** — broadly good: composite `(org_id, …)` indexes, partial indexes on hot predicates (outbox poll, unread, notifications), GIN for tags/FTS.
- **Denormalized conversation metadata** (`last_message_*`, `unread_count`) — the inbox list never aggregates messages.
- **Workers** — configurable concurrency, idempotency keys, exponential backoff, no external calls inside DB transactions.

The findings below are the gaps.

---

## Findings (ranked by ROI)

### F1 — Serverless DB pool `max: 1` serializes the dashboard's ~14 "parallel" queries
**Severity: HIGH · Risk to fix: LOW · `src/lib/server/db/client.ts:47-52`**

The serverless client is configured `max: 1`. The dashboard summary endpoint (`/api/dashboard/summary`) fires ~12–14 queries inside a `Promise.all`, but they all queue on the single connection — total latency is the **sum** of every query's round trip instead of the **max**. The same applies to `Promise.all` in `loadThread`-backing endpoints and anywhere else queries are issued concurrently.

With a pooler round trip of ~10–40 ms per query (more if Vercel region ≠ Supabase region — see F8), the dashboard pays 150–500 ms+ of pure serialization on every cache miss.

- **Root cause:** `max: 1` was chosen for serverless safety, but the Supabase transaction pooler (PgBouncer/Supavisor) exists precisely to multiplex many short-lived client connections. A modest per-instance pool is the intended usage.
- **Fix:** raise serverless pool to `max: 4–6` (keep `prepare: false`). Verify Supabase pooler `default_pool_size` headroom (Supabase MCP can confirm).
- **Expected gain:** dashboard cold response time cut by ~50–70 %; every multi-query endpoint benefits. Zero code changes outside `client.ts`.
- **Risk:** connection exhaustion under extreme concurrency — mitigated by pooler-side limits and `idle_timeout: 20`. Low.

### F2 — Per-request auth overhead: network call to Supabase Auth + DB query on every request
**Severity: HIGH · Risk to fix: MEDIUM · `src/hooks.server.ts:111-114`, `src/lib/server/auth/loadAuthContext.ts`**

Every authenticated request pays, serially, before the handler runs:
1. `supabase.auth.getUser()` — an HTTPS round trip to Supabase Auth (~50–150 ms).
2. `loadAuthContext()` — a DB query (orgMembers ⋈ organizations; indexed, fast, but another RTT).

That is a fixed ~70–200 ms tax on **every** API call and page navigation, dominating response time for cheap endpoints (`/api/session/status` does nothing else).

- **Fix (a):** switch to local JWT verification — enable asymmetric JWT signing keys in Supabase and use `supabase.auth.getClaims()` (verifies locally against cached JWKS, no network call). Falls back to `getUser()` only when keys are unavailable.
- **Fix (b):** per-instance micro-cache of `loadAuthContext` results (TTL 10–30 s, keyed by user id). Org suspension/permission changes propagate within TTL; the existing 20-min client poll + `feature_overrides_updated_at` mechanism already tolerates staleness far larger than 30 s.
- **Expected gain:** −70 to −200 ms on every authenticated request. The single biggest lever for perceived app speed.
- **Risk:** auth-sensitive — needs careful review of revocation semantics (a banned user could retain access for up to the cache TTL / token expiry). Implement behind a small, well-commented module; keep TTL short.

### F3 — Puppeteer (full Chromium) inside Vercel serverless routes
**Severity: HIGH (possibly broken in prod) · Risk to fix: MEDIUM · `src/lib/server/quotes/pdf.ts`, `src/lib/server/invoices/pdf.ts`, used by `/api/quotes/[id]/pdf` and `/i/[token]/pdf`**

Both PDF routes import the full `puppeteer` package and `puppeteer.launch()` a Chromium inside a Vercel function. Full puppeteer bundles a ~170 MB+ Chromium that generally **exceeds Vercel's function size limit** (250 MB uncompressed) once combined with the rest of the bundle — and even when it deploys, cold start is 3–10 s and memory spikes to 500 MB+ per render. The `_browser` singleton only helps on warm instances.

- **Fix options (pick one):**
  1. Move PDF generation to the Railway worker via the outbox (`pdf.render.requested` → worker renders → R2 → presigned URL). Cleanest; matches existing architecture; worker already long-lived so the browser singleton actually pays off.
  2. Swap to `puppeteer-core` + `@sparticuz/chromium` (serverless-built Chromium, ~50 MB) if PDFs must stay synchronous.
- **Expected gain:** reliable deploys, P99 for PDF endpoints from ~10 s → sub-second (async) or ~2 s (sparticuz), Vercel memory/cost down sharply.
- **Needs confirmation:** whether these endpoints currently work in production at all.

### F4 — `unreadCountReconcile` cron scans every message in the database hourly
**Severity: MEDIUM (grows linearly with data) · Risk to fix: LOW · `src/lib/server/cron/unreadCountReconcile.ts`**

The hourly reconcile does `conversations LEFT JOIN messages` over **all** non-deleted conversations and **all** their messages, grouped, then diffs. `messages` is the largest table in the system; this is O(total messages) every hour, forever.

- **Fix:** restrict the candidate set — only conversations where drift is possible: `WHERE c.unread_count <> 0 OR c.updated_at > now() - interval '2 hours'`, and count unread via the existing `idx_messages_direction_read (conversation_id, direction, read_at)` partial path instead of joining all messages.
- **Expected gain:** hourly job from O(all messages) to O(active conversations). At 1 M messages this is the difference between a 30 s table scan and a few ms.

### F5 — Missing composite indexes on hot query paths
**Severity: MEDIUM · Risk to fix: LOW (pure DDL, `CREATE INDEX CONCURRENTLY`)**

| Query | Current path | Missing index |
|---|---|---|
| Contacts list — `ORDER BY created_at DESC, id DESC` per org (`/api/contacts`) | `idx_contacts_org_id` then sort of all org contacts every page | `contacts (org_id, created_at DESC, id DESC) WHERE deleted_at IS NULL` |
| Dashboard revenue — `payments WHERE org_id AND paid_at >= …` | `idx_payments_org_id` then filter | `payments (org_id, paid_at DESC)` |
| Dashboard jobs-won — `opportunities WHERE org_id AND closed_at >= …` | `idx_opportunities_org_id` then filter | `opportunities (org_id, closed_at DESC) WHERE closed_at IS NOT NULL AND deleted_at IS NULL` |
| Inbox `has_delivery_failure` EXISTS per row (30×/page, both `/api/conversations` and detail) | `idx_messages_conversation_id` then filter each thread's messages | `messages (conversation_id) WHERE direction = 'outbound' AND is_internal_note = false AND status IN ('failed','bounced','undeliverable')` — tiny partial index, makes the EXISTS near-free |

- **Expected gain:** each affected query drops from index-scan+filter/sort to direct index range scan. Most material on the inbox list (correlated EXISTS × 30 rows × every poll/revalidate).
- **Note:** per the project's migration workflow, these are hand-written SQL migrations + journal entries (drizzle generate is broken — see memory).

### F6 — Thread-messages pagination cursor appears to walk the wrong direction
**Severity: MEDIUM (correctness flag, perf-adjacent) · `src/routes/api/conversations/[id]/messages/+server.ts:106-124`**

The query orders `ASC (created_at, id)` and returns the **oldest** 50 messages first; the cursor then filters `created_at < cursor` (older still), which can only re-return earlier rows. For threads > 50 messages, page 1 is the oldest 50 and "load more" cannot reach newer messages. The client (`loadMoreThreadMessages`) prepends pages as if paging backwards through history from newest — which would require `DESC` order + reverse on the client.

This is flagged for confirmation, not silently fixed: today most threads are likely < 50 messages so it never bites, but it's both a latent correctness bug and means long threads fetch the wrong page. **Please confirm intended behavior** (newest-first paging is the standard for chat UIs).

### F7 — Conversation detail endpoint: 4 sequential follow-up queries after the lateral join
**Severity: LOW-MEDIUM · Risk to fix: LOW · `src/routes/api/conversations/[id]/+server.ts:190-212`**

After the (excellent) single lateral query, the handler awaits `hasActiveWebchatSession` → `isOrgEmailReady` → `hasMessengerIdentity` → `getCurrentUsage` **sequentially** — 4 extra round trips on the hot thread-open path. With F1 fixed, a `Promise.all` makes them concurrent; alternatively fold them into the lateral query as three more EXISTS columns.

- **Expected gain:** thread-open detail call ~3 round trips faster (~30–100 ms).

### F8 — Vercel function region not pinned to the Supabase region
**Severity: POTENTIALLY HIGH · Risk to fix: TRIVIAL · `svelte.config.js`**

The adapter is used with all defaults — no `regions` config. If Vercel functions run in a different region than the Supabase project, **every** DB round trip pays 50–200 ms of cross-region latency, multiplied by the per-request query counts above. This single setting can dwarf every other fix.

- **Fix:** `adapter({ regions: ['<supabase-region>'] })` (e.g. `iad1` for us-east-1). One line.
- **Needs confirmation:** current Vercel region vs. Supabase project region.

### F9 — Dashboard summary: duplicate scans and per-instance cache
**Severity: LOW-MEDIUM · Risk to fix: MEDIUM · `src/routes/api/dashboard/summary/+server.ts`**

- `contacts` is scanned twice (leads KPI + aging leads) and `invoices` twice (overdue + outstanding). Leads + aging-leads can merge into one pass; overdue can fold into the outstanding query.
- The missed-call recovery CTE runs a correlated EXISTS per missed call — acceptable at monthly volumes, watch it.
- The 5 s in-memory cache is per serverless instance, so cold/other instances always pay full cost. Acceptable; not worth Redis for 5 s TTL. F1 + F5 reduce the underlying cost instead.
- **Expected gain (query merges):** ~3 fewer round trips and 2 fewer table scans per cache miss. Do after F1/F5; measure first — F1 may make this unnecessary.

### F10 — `@lucide/svelte` barrel imports in 146 files
**Severity: LOW (dev experience; prod is tree-shaken) · Risk to fix: LOW (mechanical)**

146 files import icons from the `@lucide/svelte` barrel (~1,500 modules pulled into the dev module graph). Production output is tree-shaken fine, but dev server cold start and HMR pay for it. 7 files already use the correct deep form (`@lucide/svelte/icons/x`).

- **Fix:** mechanical codemod to deep imports. No runtime behavior change.
- **Expected gain:** noticeably faster `npm run dev` cold start and HMR; no prod change.

### F11 — Minor server-side round-trip trims (batch later, opportunistically)
**Severity: LOW**

- `POST /api/conversations/[id]/messages` (SMS branch): ~6 sequential pre-flight queries (conv → contact → media validate → org → credit). Conv+contact can be one join; org's `twilio_phone_number` can ride along. Saves 2–3 RTTs per send.
- `outboxWorker.isFeatureEnabled` selects the full `organizations` row (`select()` with no projection) for one boolean. Cached 15 s, so low impact — project just the flag column.
- `outboxWorker` finalize loop updates `unrouted`/`failures` rows one-by-one — fine at BATCH_SIZE 10, not worth changing now.
- `GET /api/conversations` ORDER BY uses a computed expression (`unread_inbound`) that no index can serve — fine at per-org inbox sizes; revisit only if an org exceeds ~50 k conversations.

---

## Explicitly checked, no action needed

- **N+1 queries:** none found in API routes — lists use joins or single batched `inArray` follow-ups (e.g. media per message page).
- **Transaction discipline:** no external calls inside transactions anywhere inspected (rule #8 is being followed).
- **BullMQ:** dedup via deterministic jobIds, sane retry/backoff, removeOnComplete configured — no queue bloat risk.
- **Redis:** single shared ioredis connection per process, `maxRetriesPerRequest: null` (BullMQ requirement). Correct.
- **Client polling:** session status every 20 min, dashboard SWR 8 s against a 5 s server cache, throttled inbox revalidation (3 s window). No polling storms.
- **Payload sizes:** list endpoints project explicit columns; messages GET uses `select()` (full rows) — acceptable, columns are all rendered.
- **worker DB client:** direct :5432, `prepare: true`, pool 10 — correct for a long-lived process.

---

## Estimated cumulative impact

| Area | Today (est.) | After P0+P1 (est.) |
|---|---|---|
| Any authenticated API call (fixed overhead) | 70–200 ms | 10–40 ms (F2) |
| Dashboard summary (cache miss) | 300–800 ms | 100–250 ms (F1+F5+F8) |
| Inbox thread open | 200–500 ms | 80–200 ms (F1+F2+F7) |
| Quote/Invoice PDF | 3–10 s or failing | < 1 s perceived (F3, async) |
| Hourly reconcile cron | O(all messages) | O(active conversations) (F4) |
| Dev server cold start | slow (icon graph) | substantially faster (F10) |

Estimates assume same-region Vercel↔Supabase; if F8 reveals a cross-region setup, gains are larger.
