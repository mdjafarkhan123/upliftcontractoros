# CLAUDE.md

This file governs how Claude Code works in this repository.
Read this file completely before starting any task.

---

## Reference Documents

All architecture documents live in `/docs/`. Before starting any task, read the ones that apply.

| Document                           | Read When                                           |
| ---------------------------------- | --------------------------------------------------- |
| `Blueprint v3.md`                  | Product decisions, UX rules, module scope           |
| `Master Domain Architecture v1.md` | Entity rules, relationships, 30 architectural rules |
| `Core Schema Design v1.md`         | Exact table/column definitions — authoritative      |
| `Event System Architecture v1.md`  | Outbox pattern, event catalog, worker logic         |
| `RLS Policy Matrix v1.md`          | All Row Level Security policies                     |
| `Roles & Access Matrix v2.md`      | 39 permission booleans, role templates, nav rules   |

**Never assume schema structure from memory. Always read the relevant doc first.**

---

## Commands

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

## Non-Negotiable Technical Rules

These rules are never overridden by a prompt. If a task conflicts with any of these, stop and flag it.

---

### 1 — Svelte 5 Runes Only

No Svelte 4 syntax anywhere. Ever.

```svelte
// CORRECT
let { value, onClose } = $props();
let doubled = $derived(value * 2);
$effect(() => { console.log(value); });
<button onclick={handler}>Click</button>
<input oninput={handler} />

// FORBIDDEN
export let value;
$: doubled = value * 2;
import { createEventDispatcher } from 'svelte';
<button on:click={handler}>Click</button>
<input on:input={handler} />
```

---

### 2 — SCSS Only. No Exceptions.

No Tailwind. No inline styles unless genuinely unavoidable (e.g. dynamic CSS custom property values).

Bits UI components expose state via data attributes — style them that way:

```scss
// CORRECT
[data-dialog-content][data-state='open'] {
	opacity: 1;
}
[data-menu-item][data-highlighted] {
	background: var(--color-accent);
}
[data-menu-item][data-disabled] {
	opacity: 0.4;
}

// WRONG — Bits UI does not add state classes
.dialog.open {
}
.menu-item.highlighted {
}
```

Use CSS custom properties (`--color-background`, `--color-foreground`, `--font-family-base`) — never hardcode values.

---

### 3 — Mobile-First. Always.

90% of users are on mobile. Every component and layout is designed for 375px first, then scaled up.

- Minimum touch target: 44px height on all interactive elements
- No hover-only interactions — every action must be tap-accessible
- Bottom navigation is the primary nav pattern on mobile
- Test at 375px before testing at 1280px

---

### 4 — CSR Only. SSR Never.

`ssr = false` in `src/routes/+layout.ts`. Never override this on any route.
All data loading happens client-side via `fetch()` to `/api/*` routes.
Never use `+page.server.ts` for UI data loading.

---

### 5 — Server Isolation is Absolute.

`SUPABASE_SERVICE_ROLE_KEY` must never appear in any `.svelte` file or `+page.ts` file.
All database writes go through SvelteKit API routes (`/api/*`).
`src/lib/server/*` is never imported in `.svelte` files — SvelteKit enforces this.

---

### 6 — Workers Run as a Standalone Process.

Workers run via `worker.ts` at the project root — a separate Node.js process.
Workers are NEVER started from `hooks.server.ts`, `+layout.ts`, or any SvelteKit lifecycle.
Starting workers inside SvelteKit creates competing instances under load and restart loops in development.

```bash
# Correct: two separate processes
npm run dev       # terminal 1 — SvelteKit app
npx tsx worker.ts # terminal 2 — worker process
```

---

### 7 — All Permission Checks Go Through `checkPermission()`.

The 39 boolean columns on `org_members` are the sole authority for access control.
The `role` column is for display only — never used for access decisions.

```typescript
// CORRECT
const allowed = await checkPermission(member.id, 'can_view_all_quotes');
if (!allowed) return json({ error: 'Forbidden' }, { status: 403 });

// FORBIDDEN — direct boolean reads scattered in route handlers
if (!member.can_view_all_quotes) return ...
if (member.role === 'admin') return ...
```

All permission checks route through `src/lib/server/permissions/index.ts`. No exceptions.

---

### 8 — Transaction Boundary Law.

This is the most critical operational rule in the system.

**INSIDE a database transaction:**

- All business row mutations
- `outbox_events` INSERT (always last, always inside)

**OUTSIDE (via outbox worker only):**

- BullMQ job enqueue
- Twilio SMS dispatch
- Resend email dispatch
- Any external HTTP call
- Supabase Realtime publish

Never call Twilio, email, or any external service inside a database transaction.
If the transaction rolls back, the external call cannot be undone.

---

### 9 — Tenant Isolation Is Absolute.

Every table has `org_id`. Every query filters by it. No exceptions.
An `org_id` mismatch must never return data across tenant boundaries.
RLS enforces this at the database layer. The API layer must also enforce it.

---

### 10 — Schema Is Authoritative.

Do not invent columns, tables, relationships, or enum values not in `Core Schema Design v1.md`.
If something appears to be missing, stop and ask — do not add it.
Before writing any database logic: read the relevant schema section, verify exact names.

---

### 11 — Outbox Pattern Is Non-Negotiable.

Business events must flow through the outbox/event architecture.
Never trigger automations, SMS, or emails directly from route handlers.
Never call external services directly from page components.
Workers process all side effects asynchronously after commit.

---

### 12 — /jafar Is Completely Isolated.

The `/jafar` session and the contractor Supabase session are architecturally separate.
`/jafar` routes use their own `jafarSession` cookie — not Supabase Auth.
The Platform Owner has no `org_id`, no `org_members` row, no Supabase auth record.
Never check a jafar session inside contractor middleware. Never mix them.

---

### 13 — Client-Side Auth Guard Is Mandatory

hooks.server.ts protects the initial page load and all API routes.
It does NOT fire on client-side navigation between pages.

/(app)/+layout.svelte must also check session validity on mount
and on every navigation event. If no valid session: redirect to /auth/login.
Both guards are required. Neither replaces the other.

---

## Architecture Contracts

### Two Session Systems — Never Mixed

| Session        | Path       | Auth mechanism             | DB identity          |
| -------------- | ---------- | -------------------------- | -------------------- |
| Contractor     | `/(app)/*` | Supabase Auth cookie       | `org_members` row    |
| Platform Owner | `/jafar/*` | Custom httpOnly JWT cookie | None — env vars only |

### Three-Layer Architecture

```
Layer 1 — DB (PostgreSQL + Drizzle)
  Source of truth. Atomic transactions. outbox_events inserted here.

Layer 2 — Async Infrastructure (outbox worker + BullMQ + Redis)
  Guaranteed at-least-once delivery. Workers process side effects.

Layer 3 — Reactive UI (Supabase Realtime)
  UI delivery only. Never used for business-critical orchestration.
```

Supabase Realtime is a UI convenience, not an event bus. A missed Realtime event
is a UX inconvenience. A missed outbox event is a business failure.

### RLS Responsibility Split

RLS enforces: `org_id` tenant isolation on every table.
API middleware enforces: all 39 fine-grained permission checks.
These two layers have distinct, non-overlapping responsibilities.

---

## Component Library Rules

**Bits UI** is used for all accessibility-critical interactive primitives:
Dialog, Sheet, DropdownMenu, Select, Popover, Accordion, Tooltip, Switch, Combobox, Tabs.

**Custom SCSS components** handle everything else:
Layout, cards, badges, nav, skeleton loaders, empty states, page wrappers.

Domain components live in `src/lib/components/{domain}/`.
Shared components live in `src/lib/components/shared/`.
Never put business logic in component files — keep them presentation-focused.

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

## Code Quality Rules

### No Over-Engineering

- Prefer explicit code over clever abstractions
- Do not create generic builders, factories, registries, or plugin systems
- Avoid reusable abstractions until duplication is proven across 3+ use cases
- Optimize for readability and maintainability — not theoretical flexibility
- Business logic should be domain-oriented and readable

### Minimal Edits

Before modifying a large existing file:

- Explain exactly what will change and why
- Avoid rewriting sections unrelated to the task
- Prefer surgical edits over complete rewrites
- Preserve existing naming conventions unless told otherwise

### Validation

Every `POST` and `PATCH` API route validates input with a Zod schema.
Validation schemas are co-located with the route or in `src/lib/types/`.
Phone fields: E.164 normalization applied before every write.
Monetary values: reject negative amounts. USD only. `numeric(12,2)`.

---

## Database Rules

- Never perform external API calls inside transactions
- Never use PostgreSQL CASCADE DELETE on the `organizations` table
- Never hard-delete production entities unless explicitly specified in the task
- Never bypass `org_id` filtering — tenant isolation is absolute
- Soft deletes use `deleted_at`. Immutable records (payments, messages, reviews) have no `deleted_at`
- Sequential numbers (`quote_number`, `invoice_number`) use `SELECT FOR UPDATE` on `org_counters`
- `payments` rows are never edited or deleted — they are financial records

---

## Event System Rules

- All async side effects flow through `outbox_events` → outbox worker → BullMQ
- Never enqueue BullMQ jobs directly from API routes — only from the outbox worker
- Every BullMQ worker checks idempotency before executing
- Every BullMQ worker checks `sms_opt_out` before sending SMS
- Every BullMQ worker checks `automation_settings` enabled flag before proceeding
- Job cancellation: find `automation_jobs` by resource, call `queue.remove()`, set status='cancelled'
- Workers must check `automation_jobs.status` at start — exit immediately if 'cancelled'

---
