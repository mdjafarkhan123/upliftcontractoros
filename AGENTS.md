# AGENTS.md

This file governs how Claude Code works in this repository.
Read this file completely before starting any task.

---

## Skills

Domain-specific reference skills live in `.codex/skills/`.
Load them when relevant — do not load all at once.

| Working on                                                 | Load skill                          |
| ---------------------------------------------------------- | ----------------------------------- |
| Entity CRUD, status transitions, lifecycle rules,          | `contractor-crm`                    |
| financial operations, contact dedup, quote/invoice flows,  | → `references/business-rules.md`    |
| job creation, pipeline stages, soft delete, relationships  |                                     |
| ---------------------------------------------------------- | ------------------                  |
| Permission checks, auth middleware, RLS policies, JWT,     | `contractor-crm`                    |
| role templates, /jafar, team member CRUD, member           | → `references/permissions-auth.md`  |
| deactivation, navigation rendering                         |                                     |
| ---------------------------------------------------------- | ------------------                  |
| Outbox events, BullMQ workers, automation sequences,       | `contractor-crm`                    |
| Realtime, notification dispatch, idempotency keys,         | → `references/automation-events.md` |
| webhook handlers (Twilio, Stripe), event emission          |                                     |
| ---------------------------------------------------------- | ------------------                  |
| Any .svelte file, +page.ts, +layout, Bits UI, SCSS,        | `contractor-crm-svelte-ui`          |
| navigation, Realtime in UI, client auth guard              |                                     |

The `contractor-crm` skill covers business rules, permission matrix,
transaction patterns, and automation architecture. Its SKILL.md has
universal rules; read only the specific reference file for your task.
Do not reconstruct business rules from memory — always consult the skill.

## Reference Documents

All architecture documents live in `/docs/`. Before starting any task, read the ones that apply.

| Document                           | Read When                                           |
| ---------------------------------- | --------------------------------------------------- |
| `Blueprint v3.md`                  | Product decisions, UX rules, module scope           |
| `Master Domain Architecture v1.md` | Entity rules, relationships, 30 architectural rules |
| `Core Schema Design v1.md`         | Exact table/column definitions — authoritative      |
| `Event System Architecture v1.md`  | Outbox pattern, event catalog, worker logic         |
| `RLS Policy Matrix v1.md`          | All Row Level Security policies                     |
| `Roles & Access Matrix v2.md`      | 40 permission booleans, role templates, nav rules   |

**Never assume schema structure from memory. Always read the relevant doc first.**

---

## Commands

run these commands only when necessary

```bash
npm run dev           # start dev server
npm run build         # production build
npm run preview       # preview production build
npm run check         # svelte-kit sync + TypeScript/Svelte type checking
npm run check:watch   # type checking in watch mode
npm run lint          # prettier --check + eslint
npm run format        # prettier --write

npx tsx worker.ts     # start standalone worker process (separate terminal)

npx drizzle-kit generate   # generate migration from schema changes
npx drizzle-kit migrate    # run pending migrations
npx drizzle-kit studio     # open Drizzle Studio GUI
```

---

## Stack

| Layer            | Technology                                           |
| ---------------- | ---------------------------------------------------- |
| Framework        | SvelteKit 5 + Svelte 5 (runes)                       |
| Rendering        | CSR only — `ssr = false` globally                    |
| Database         | PostgreSQL via Supabase + Drizzle ORM + postgres.js  |
| Auth             | Supabase SSR + JWT + bcryptjs + otplib (TOTP)        |
| Queue            | BullMQ + ioredis (Redis)                             |
| Cron             | node-cron                                            |
| Email            | Resend                                               |
| SMS              | Twilio                                               |
| Storage          | Cloudflare R2 (S3-compatible — `@aws-sdk/client-s3`) |
| Image processing | Sharp                                                |
| PDF              | Puppeteer                                            |
| UI primitives    | Bits UI                                              |
| Validation       | Zod                                                  |
| Styling          | SCSS (sass-embedded) + CSS custom properties         |

---

## Project Structure

```
project root
  worker.ts                   ← Standalone worker process. Never touched by SvelteKit.

src/
  routes/
    +layout.svelte            ← Root layout — imports global.scss, renders children
    +layout.ts                ← ssr = false (global, never override)
    (app)/                    ← Authenticated contractor app routes
    jafar/                    ← Super admin routes — ISOLATED, NOT under (app)/
    api/                      ← All SvelteKit server API endpoints
    auth/                     ← Login, logout, forgot-password, callback
    q/                        ← Public quote routes (no auth)
    change-password/          ← First-login password change

  lib/
    server/                   ← Server-only. Never imported in .svelte files.
      db/
        schema/               ← Drizzle schema (one file per domain)
          index.ts            ← Re-exports all tables, enums, types
        client.ts             ← Drizzle instance (service role DATABASE_URL)
        migrate.ts            ← Migration runner
      auth/                   ← Session helpers (contractor + jafar — separate)
      permissions/            ← checkPermission() + PermissionKey type
      queue/                  ← BullMQ connection + queue definitions
      workers/                ← outboxWorker, automationWorker, notificationWorker
      cron/                   ← node-cron job registrations
      media/                  ← R2 upload/delete helpers (Sharp processing)
      org/                    ← Org deletion cascade
    components/
      shared/                 ← SkeletonLoader, EmptyState, PageWrapper, Badge, etc.
      contacts/
      pipeline/
      jobs/
      inbox/
      quotes/
      invoices/
      appointments/
      reputation/
      notifications/
      team/
      dashboard/
      growth/
      settings/
    styles/
      _variables.scss         ← Design tokens: colors, spacing, breakpoints, touch targets
      _mixins.scss
      _reset.scss
      global.scss
    types/                    ← Shared TypeScript types
    utils/
      phone.ts                ← E.164 normalization (libphonenumber-js)
      format.ts               ← Currency, date, quote/invoice number formatters
      hash.ts                 ← SHA-256 helpers
```

---

## Non-Negotiable Rules

These rules are never overridden by a prompt. If a task conflicts with any of these, stop and flag it.

Full patterns and code examples live in skills — these are the guardrails.

1. **Svelte 5 Runes only** — no `export let`, no `$:`, no `on:click`, no slots, no `writable`. Details in `contractor-crm-svelte-ui` skill.
2. **SCSS only** — no Tailwind, no inline styles. Bits UI styled via data attributes. Details in `contractor-crm-svelte-ui` skill.
3. **Mobile-first always** — 375px base, 44px touch targets, no hover-only interactions.
4. **CSR only** — `ssr = false` globally. Never use `+page.server.ts` for UI data. Never override.
5. **Server isolation absolute** — `SUPABASE_SERVICE_ROLE_KEY` never in `.svelte` or `+page.ts`. All writes go through `/api/*`. `$lib/server/*` never imported in `.svelte` files.
6. **Workers run standalone** — `npx tsx worker.ts` in a separate terminal. Never started from `hooks.server.ts`, `+layout.ts`, or any SvelteKit lifecycle.
7. **All permission checks go through `checkPermission()`** — the 40 booleans on `org_members` are sole authority. `role` column is display only. Never `if (member.role === 'admin')`.
8. **Transaction boundary law** — business mutations + `outbox_events` INSERT inside the transaction. BullMQ enqueue, Twilio, Resend, any external call OUTSIDE (via outbox worker only). Never call external services inside a transaction.
9. **Tenant isolation absolute** — every table has `org_id`, every query filters by it. RLS enforces at DB layer. API layer also enforces.
10. **Schema is authoritative** — do not invent columns, tables, or enums. If something seems missing, ask. Read the relevant schema section before writing any DB logic.
11. **Outbox pattern non-negotiable** — business events flow through `outbox_events` → outbox worker → BullMQ. Never trigger automations, SMS, or emails directly from route handlers.
12. **`/jafar` completely isolated** — separate `jafarSession` cookie, no `org_id`, no `org_members` row, no Supabase auth. Never check jafar session in contractor middleware. Never mix.
13. **Client-side auth guard mandatory** — `hooks.server.ts` protects initial load + API routes. `/(app)/+layout.svelte` protects client-side navigation. Both required. Neither replaces the other.

---

## Architecture Contracts

### Two Session Systems — Never Mixed

| Session        | Path       | Auth mechanism             | DB identity          |
| -------------- | ---------- | -------------------------- | -------------------- |
| Contractor     | `/(app)/*` | Supabase Auth cookie       | `org_members` row    |
| Platform Owner | `/jafar/*` | Custom httpOnly JWT cookie | None — env vars only |

Three-layer architecture (DB → outbox+BullMQ → Realtime) and the RLS
responsibility split are defined in the `contractor-crm` skill.
Load `references/automation-events.md` or `references/permissions-auth.md` for detail.

---

## Implementation Workflow

For any non-trivial task:

1. State your understanding of the task
2. State your implementation plan
3. List every file you will create or modify
4. Call out risks and edge cases
5. **Wait for approval before writing code**

For trivial tasks (single-file, low-risk): proceed and report after.

When in doubt about task scope: ask. Do not guess and build.

---

## During Implementation

- If you hit an ambiguity: **stop and ask** — do not pick a path silently
- If spec conflicts with another document: **flag it** — do not resolve it yourself
- If a task requires a new library: **name options with tradeoffs**, ask before installing
- If touching auth, database, permissions, or payments: **confirm approach first**
- Only modify files directly related to the requested task

---

## After Implementation

Report:

- Every file created or modified
- Every decision made that was not explicitly specified
- Anything not covered by automated checks

Ask: **"Anything to adjust before we move on?"**

---

## What You Do Not Do

- Do not add features, fields, tables, or abstractions not explicitly requested
- Do not install packages without approval
- Do not resolve ambiguities silently — surface them
- Do not use Svelte 4 patterns for any reason
- Do not start workers from SvelteKit lifecycle hooks
- Do not perform external API calls inside database transactions
- Do not scatter permission boolean reads across route handlers
- Do not write mutations from `.svelte` files or `+page.ts`
- Do not expose service role credentials in any client-reachable file
- Do not refactor unrelated code during feature work
- Do not rename or move files without explicit instruction
- Do not "clean up" code outside the scope of the current task

---

## Code Quality

- Prefer explicit code over clever abstractions
- Do not create generic builders, factories, registries, or plugin systems
- Avoid reusable abstractions until duplication is proven across 3+ use cases
- Optimize for readability and maintainability — not theoretical flexibility
- Business logic should be domain-oriented and readable
- Before modifying a large file: explain what changes and why. Prefer surgical edits over rewrites.
- Every `POST` and `PATCH` route validates input with Zod. Phone: E.164 normalized. Money: reject negatives, `numeric(12,2)`.
