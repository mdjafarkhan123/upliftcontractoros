# CLAUDE.md

This file governs how Claude Code works in this repository.
Read this file completely before starting any task.

---

## Skills

Domain-specific reference skills live in `.claude/skills/`.
Load them when relevant — do not load all at once.

### Core Business & Architecture (`contractor-crm`)

| Working on...                                     | Reference File                                |
| ------------------------------------------------- | --------------------------------------------- |
| **Universal Rules** & Transaction Patterns        | `references/business-rules.md`                |
| **Permissions**, Auth Middleware, RLS, /jafar     | `references/permissions-auth.md`              |
| **Auth Session**, hooks.server.ts, feature flags  | `references/auth-session.md`                  |
| **Automation Events** catalog & payload contracts | `references/automation-events.md`             |
| **Outbox Infrastructure** & worker claim loops    | `references/outbox-worker.md`                 |
| **BullMQ Workers**, idempotency, Twilio/Stripe    | `references/bullmq-workers.md`                |
| **Event Flows** (missed call, opp won, payment)   | `references/event-flows.md`                   |
| **Schema Principles** & Enum Definitions          | `references/00-schema-principles-enums.md`    |
| **Org Identity**, onboarding, plan quotas         | `references/01-org-identity.md`               |
| **Contacts**, leads, customers, SMS opt-out       | `references/02-contacts.md`                   |
| **Pipeline** stages, opportunities, deals         | `references/03-pipeline.md`                   |
| **Jobs**, service delivery, scope of work         | `references/04-jobs.md`                       |
| **Communication**, inbox, messaging, Twilio       | `references/05-communication.md`              |
| **Quotes**, quote items, templates                | `references/06-revenue-quotes.md`             |
| **Invoices**, invoice items, payments, Stripe     | `references/07-revenue-invoices.md`           |
| **Appointments**, scheduling, reminders           | `references/08.appoinments.md`                |
| **Reputation**, reviews, feedback                 | `references/09.reputation.md`                 |
| **Files & Media**, R2 uploads                     | `references/10-files-and-media.md`            |
| **Systems & Automations**, activity logs          | `references/11-growth-automations-systems.md` |
| **Cross-Domain Map**, multi-table queries         | `references/12-cross-domain-map.md`           |

### UI Design & Aesthetics (`contractor-crm-design-reference`)

| Working on...                                   | Reference File                        |
| ----------------------------------------------- | ------------------------------------- |
| **Color System**, CSS variables, app.css        | `references/color-system.md`          |
| **Component Aesthetics**, cards, depth, buttons | `references/component-aesthetics.md`  |
| **Layout Patterns**, sidebar, sticky headers    | `references/layout-patterns.md`       |
| **Typography & Motion**, fonts, transitions     | `references/typography-and-motion.md` |

### Svelte & Frontend Patterns (`contractor-crm-svelte-ui`)

| Working on...                                    | Reference File                       |
| ------------------------------------------------ | ------------------------------------ |
| **Runes & Reactivity**, $state, $props, $derived | `references/runes-and-reactivity.md` |
| **Data Patterns**, forms, Realtime, mutations    | `references/data-patterns.md`        |
| **Shadcn Svelte** primitives & Tailwind usage    | `references/shadcn-svelte.md`        |
| **List Stores**, caching, SWR, pagination        | `references/list-stores.md`          |
| **Navigation & Auth**, guards, permission checks | `references/navigation-and-auth.md`  |
| **Shared Components**, Toasts, Skeletons         | `references/shared-components.md`    |

The `contractor-crm` skill covers business rules and architecture. Its SKILL.md has universal rules; read only the specific reference file for your task. **Never assume schema structure from memory. Always read the relevant skill file first.**

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
| Framework        | SvelteKit 2 + Svelte 5 (runes)                       |
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
| UI primitives    | Shadcn Svelte                                        |
| Validation       | Zod                                                  |
| Styling          | Tailwind CSS                                         |

---

## Project Structure

```
project root
  worker.ts                   ← Standalone worker process. Never touched by SvelteKit.
  tailwind.config.ts          ← Tailwind config — extends Shadcn Svelte defaults
  components.json             ← Shadcn Svelte CLI config (paths, aliases, style)

src/
src/
  lib/
    server/                   ← Server-only. Never imported in .svelte files.
      db/
        schema/               ← Drizzle schema files (one per domain)
        client.ts             ← Drizzle client
      auth/                   ← Session helpers
      permissions/            ← checkPermission utility + PermissionKey type
      queue/                  ← BullMQ connection + queue definitions
      workers/                ← outboxWorker, automationWorker, notificationWorker
      cron/                   ← Cron job registrations
      media/                  ← R2 upload/delete helpers
      org/                    ← Org deletion cascade
    components/               ← Feature components, one folder per domain
      shared/                 ← SkeletonLoader, EmptyState, PageWrapper, Badge, etc.
    styles/
      app.css                 ← Tailwind base imports + CSS custom properties (colors, spacing, bottom-nav height, touch target minimum)
    types/                    ← Shared TypeScript types
    utils/
      phone.ts                ← E.164 normalization
      format.ts               ← Currency, date, quote/invoice number formatters
      hash.ts                 ← SHA-256 helper
  routes/
    (app)/                    ← Protected contractor routes
    jafar/                    ← Super admin (fully isolated)
    api/                      ← All API server routes
    auth/                     ← Login, logout, forgot-password
    q/                        ← Public quote routes (no auth)
    change-password/

worker.ts                     ← Standalone worker process entry point (project root)
drizzle.config.ts             ← Points to schema/index.ts and DATABASE_URL

```

---

## Deployment — Vercel + Railway

- **Vercel** serves the SvelteKit app (routes, API, static assets including `static/webchat-widget.js`).
- **Railway** runs the standalone worker (`worker.ts`) on the free tier — build minutes are scarce.
- Railway's **Watch Paths** are configured to redeploy ONLY when worker-relevant code changes. Current watch list:
  ```
  worker.ts
  src/lib/server/workers/**
  src/lib/server/cron/**
  src/lib/server/queue/**
  src/lib/server/db/**
  src/lib/server/email/**
  src/lib/server/media/**
  src/lib/server/r2/**
  src/lib/server/twilio/**
  src/lib/server/org/**
  src/lib/server/log.ts
  package.json
  package-lock.json
  tsconfig.json
  drizzle.config.ts
  nixpacks.toml
  railway.json
  railway.toml
  Dockerfile
  ```
- **IMPORTANT:** If you add a new `$lib/server/...` import inside any worker, cron job, or queue module, you MUST add that path to Railway's Watch Paths — otherwise the worker will run against stale code. Flag this to the user whenever such an import is introduced.
- UI-only, route-only, widget-only, and business-logic-only changes (contacts, pipeline, quotes, jobs, invoices, etc. — anything NOT imported by workers) should never trigger a Railway rebuild.

---

## Non-Negotiable Rules

These rules are never overridden by a prompt. If a task conflicts with any of these, stop and flag it.
Full patterns and code examples live in skills — these are the guardrails.

1. **Svelte 5 Runes only** — no `export let`, no `$:`, no `on:click`, no slots, no `writable`. Use `$props()`, `$state()`, `$derived()`, `$effect()`, and `$bindable()` only. For two-way bindable props, declare with `$bindable()` inside `$props()`. Details in `contractor-crm-svelte-ui` skill. Write code efficiently. Focus on performance.
2. **Tailwind CSS only** — no raw CSS files (except `app.css` for Tailwind directives and Shadcn Svelte CSS variables), no inline `style` attributes, no `<style>` blocks in `.svelte` files. All styling via Tailwind utility classes. Use the `cn()` helper for conditional classes. Shadcn Svelte components are styled through Tailwind classes and CSS variable theming defined in `app.css`. Always add required mark for medatory form field.
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
14. **API error response shape is fixed** — every `/api/*` error response must use
    this exact shape:
    ```ts
    // Error
    { error: string; field_errors?: Partial<Record<string, string>>; }
    // Success with data
    { data: T }
    // Success with no body: return 204
    ```
    Never use `message`, `msg`, `details`, or any other top-level key.
    `field_errors` keys match the form field names exactly. UI reads `error` for
    toast messages and `field_errors` to map to inline field errors.
15. **List stores cache per filter key** — every tabbed/filtered list page (contacts, jobs, invoices, quotes, appointments, etc.) uses a `SvelteMap` keyed by the filter combination, with stale-while-revalidate semantics. Never single-slot caching. Never refetch on tab switch when cached. Always render `EmptyState` (never a stuck skeleton) when `items.length === 0 && status !== 'loading'`. Full pattern in `contractor-crm-svelte-ui` → `references/list-stores.md`. Reference implementations: `src/lib/stores/contacts.svelte.ts`, `src/lib/stores/jobs.svelte.ts`.

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
- Do not write mutations from `.svelte` files or `+page.ts`
- Do not expose service role credentials in any client-reachable file
- Do not refactor unrelated code during feature work
- Do not rename or move files without explicit instruction
- Do not "clean up" code outside the scope of the current task

---

## Code Quality

- Prefer explicit over clever. No generic builders, factories, or plugin systems.
- No reusable abstractions until duplication is proven across 3+ use cases.
- Every `POST` and `PATCH` route validates input with Zod. Phone: E.164 normalized. Money: reject negatives, `numeric(12,2)`.
