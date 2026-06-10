# Performance Plan — ContractorOS

Companion to `PERFORMANCE_AUDIT.md`. Ordered by ROI (impact ÷ risk). Each phase is independently shippable and measurable. **No code changes until this plan is approved.**

---

## Phase 0 — Confirmations needed before any work (no code)

| # | Question | Why it gates the plan |
|---|---|---|
| C1 | Which region is the Supabase project in, and which region do Vercel functions run in? | If mismatched, F8 (one-line fix) is the single biggest win and changes all latency estimates. |
| C2 | Do the PDF endpoints (`/api/quotes/[id]/pdf`, `/i/[token]/pdf`) currently work in production on Vercel? | Decides whether F3 is a perf fix or an outage fix, and which remedy to pick. |
| C3 | Confirm intended thread pagination: should `/api/conversations/[id]/messages` return **newest** 50 first (standard chat UX)? | F6 is a behavior change to a working-looking endpoint; needs sign-off. |
| C4 | Supabase pooler `default_pool_size` / max client connections (read via Supabase MCC read-only). | Sizes the F1 pool bump safely. |

---

## Phase 1 — High impact / low risk

### 1.1 Raise serverless DB pool (F1)
- **File:** `src/lib/server/db/client.ts`
- **Change:** serverless branch `max: 1` → `max: 5` (final number informed by C4). Keep `prepare: false`, `idle_timeout: 20`.
- **Impact:** dashboard −50–70 % on cache miss; every concurrent-query endpoint faster. Throughput per function instance up ~4×. No memory cost worth noting.
- **Verify:** time `/api/dashboard/summary` cold before/after; watch Supabase pooler connection count under load.

### 1.2 Pin Vercel region (F8 — pending C1)
- **File:** `svelte.config.js`
- **Change:** `adapter({ regions: ['<supabase-region>'] })`.
- **Impact:** if currently cross-region, −50–200 ms × every DB round trip. Otherwise no-op.

### 1.3 Hot-path composite indexes (F5)
- **Files:** new hand-written migration `drizzle/00xx_perf_indexes.sql` + `_journal.json` entry + matching `index()` definitions in `src/lib/server/db/schema/*` (kept in sync, no generate — per project workflow). Applied with `npx drizzle-kit migrate`.
- **Indexes:**
  1. `contacts (org_id, created_at DESC, id DESC) WHERE deleted_at IS NULL`
  2. `payments (org_id, paid_at DESC)`
  3. `opportunities (org_id, closed_at DESC) WHERE closed_at IS NOT NULL AND deleted_at IS NULL`
  4. `messages (conversation_id) WHERE direction = 'outbound' AND is_internal_note = false AND status IN ('failed','bounced','undeliverable')`
- **Impact:** contacts list, dashboard revenue/jobs-won, and the inbox `has_delivery_failure` EXISTS (30×/page) all become direct index scans. Write amplification negligible (one extra tiny index write per affected insert).
- **Verify:** `EXPLAIN ANALYZE` before/after for each query (read-only via Supabase MCP).

### 1.4 Scope the unread reconcile cron (F4)
- **File:** `src/lib/server/cron/unreadCountReconcile.ts`
- **Change:** restrict candidates to `c.unread_count <> 0 OR c.updated_at > now() - interval '2 hours'`; count via the indexed `(conversation_id, direction, read_at)` path instead of joining all messages.
- **Impact:** hourly job from O(all messages) → O(active conversations). Safety-net semantics unchanged (any drift on a touched conversation is still caught; a stale-drifted row with unread_count≠0 is still swept).
- **Verify:** run once manually, compare `affected_count` to previous runs; EXPLAIN the new query.

### 1.5 Parallelize conversation-detail follow-ups (F7)
- **File:** `src/routes/api/conversations/[id]/+server.ts`
- **Change:** `Promise.all([hasActiveWebchatSession, isOrgEmailReady, hasMessengerIdentity, getCurrentUsage])` (effective once 1.1 lands).
- **Impact:** thread open −3 round trips (~30–100 ms). Zero behavior change.

**Phase 1 exit criteria:** dashboard cache-miss < 250 ms; thread open < 200 ms; reconcile cron < 1 s; no pooler connection alarms. Re-measure before starting Phase 2.

---

## Phase 2 — High impact / medium risk (each needs individual approval)

### 2.1 Local JWT verification + auth-context micro-cache (F2)
- **Files:** `src/hooks.server.ts`, `src/lib/server/auth/loadAuthContext.ts`, Supabase project setting (asymmetric signing keys).
- **Change (two independent steps):**
  - (a) Enable asymmetric JWT signing keys; replace `getUser()` with `getClaims()` (local JWKS verification, no network RTT). Keep `getUser()` fallback path.
  - (b) Per-instance `Map` cache of `loadAuthContext` results, TTL 15 s, keyed by `user.id`; invalidated naturally by TTL.
- **Impact:** −70 to −200 ms on **every** authenticated request — the largest perceived-speed win available.
- **Risk & mitigation:** revocation latency — a deactivated member/suspended org retains access ≤ 15 s (cache) / token lifetime (JWT). Mitigate with short TTL, and keep the existing suspended-org enforcement on writes. **Auth-sensitive: approach to be confirmed before implementation per CLAUDE.md.**

### 2.2 Move PDF rendering off serverless (F3 — pending C2)
- **Preferred:** outbox event `pdf.render.requested` → Railway worker renders (long-lived browser singleton finally pays off) → R2 → endpoint returns/polls presigned URL. Matches Rule #8/#11 architecture.
- **Fallback (if synchronous response is required):** `puppeteer-core` + `@sparticuz/chromium` (new dependency — requires approval per CLAUDE.md).
- **Impact:** reliable deploys; PDF P99 from 3–10 s to sub-second perceived; Vercel memory/cost down sharply.

### 2.3 Fix thread pagination direction (F6 — pending C3)
- **Files:** `src/routes/api/conversations/[id]/messages/+server.ts`, `src/lib/stores/inbox.svelte.ts`
- **Change:** order `DESC`, return newest page first, reverse client-side for display; cursor pages older. Aligns endpoint, cursor, and `loadMoreThreadMessages` prepend logic.
- **Impact:** correctness for >50-message threads; first page always shows the latest messages (also the cheapest page to serve via `messages_org_conv_created_idx`).

---

## Phase 3 — Everything else (low risk, lower impact; batch opportunistically)

| Item | File(s) | Change |
|---|---|---|
| 3.1 Lucide deep imports (F10) | 146 `.svelte`/`.ts` files | Codemod `from '@lucide/svelte'` → `from '@lucide/svelte/icons/<kebab>'`. Dev-only gain; mechanical; do in one dedicated PR so it never pollutes feature diffs. |
| 3.2 Merge dashboard duplicate scans (F9) | `api/dashboard/summary/+server.ts` | Leads + aging-leads into one contacts pass; overdue folded into outstanding query. **Measure after Phase 1 first — may no longer be worth it.** |
| 3.3 Trim send pre-flight round trips (F11) | `api/conversations/[id]/messages/+server.ts` | Conv ⋈ contact in one query; org `twilio_phone_number` joined in. −2–3 RTTs per send. |
| 3.4 Project feature-flag column in outbox worker (F11) | `outboxWorker.ts` | `select({ flag: organizations[feature] })` instead of full row. |

---

## Explicitly NOT planned (rejected as premature)

- Redis-backed response caching for the dashboard — 5 s TTL workload doesn't justify the infra; F1/F5 attack the root cost.
- Rewriting the inbox sort to be index-served — per-org volumes don't warrant it; noted as a revisit trigger at ~50 k conversations/org.
- Any batching/refactor of the outbox finalize loop — BATCH_SIZE 10 makes it irrelevant.
- Any schema denormalization beyond what exists — current denormalized conversation metadata already covers the hot paths.

---

## Measurement protocol (applies to every phase)

1. **Before:** capture timings — `EXPLAIN ANALYZE` for touched queries (read-only via Supabase MCP); wall-clock the three hot endpoints (`/api/dashboard/summary` cold, `/api/conversations`, conversation detail) 5× each.
2. **After:** same measurements; record in the PR description.
3. **Regression gates:** `npm run check` + `npm run lint` green; manual smoke of dashboard, inbox list, thread open/send, contacts list.
4. Any change that doesn't show a measurable win gets reverted, not kept "because it should help."

---

## Approval checklist

- [ ] Phase 1 (1.1–1.5) — approve as a batch?
- [ ] C1–C4 answers (region, PDF prod status, pagination intent, pooler size)
- [ ] Phase 2 items — approve individually after Phase 1 re-measure
- [ ] Phase 3 — approve as opportunistic batch (3.1 as its own PR)
