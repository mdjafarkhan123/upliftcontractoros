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
| **Project structure**                             | `references/project-structure.md`             |
| **Project Tech Stack**                            | `references/stack.md`                         |

### UI Design & Aesthetics (`contractor-crm-design-reference`)

| Working on...                                   | Reference File                        |
| ----------------------------------------------- | ------------------------------------- |
| **Color System**, CSS variables, app.css        | `references/color-system.md`          |
| **Component Aesthetics**, cards, depth, buttons | `references/component-aesthetics.md`  |
| **Layout Patterns**, sidebar, sticky headers    | `references/layout-patterns.md`       |
| **Typography & Motion**, fonts, transitions     | `references/typography-and-motion.md` |

You are able to use the Svelte MCP server, where you have access to comprehensive Svelte 5 and SvelteKit documentation. Here's how to use the available tools effectively:

## Available Svelte MCP Tools:

### 1. list-sections
Use this FIRST to discover all available documentation sections. Returns a structured list with titles, use_cases, and paths.
When asked about Svelte or SvelteKit topics, ALWAYS use this tool at the start of the chat to find relevant sections.

### 2. get-documentation
Retrieves full documentation content for specific sections. Accepts single or multiple sections.
After calling the list-sections tool, you MUST analyze the returned documentation sections (especially the use_cases field) and then use the get-documentation tool to fetch ALL documentation sections that are relevant for the user's task.

### 3. svelte-autofixer
Analyzes Svelte code and returns issues and suggestions.
You MUST use this tool whenever writing Svelte code before sending it to the user. Keep calling it until no issues or suggestions are returned.

### 4. playground-link
Generates a Svelte Playground link with the provided code.
After completing the code, ask the user if they want a playground link. Only call this tool after user confirmation and NEVER if code was written to files in their project.

The `contractor-crm` skill covers business rules and architecture. Its SKILL.md has universal rules; read only the specific reference file for your task. **Never assume schema structure from memory. Always read the relevant skill file first.**

---

## MCP Servers

Connected MCP servers and their usage rules. Tool availability is automatic — these rules define the boundaries.

- **Svelte** (`mcp__svelte__*`) — official Svelte 5 / SvelteKit docs. Run `list-sections` → `get-documentation` before writing Svelte, and `svelte-autofixer` on any component until it returns no issues. (See the Svelte tool guidance above.)
- **Supabase** (`mcp__supabase__*`) — read operations (`list_tables`, `list_migrations`, `get_logs`, `get_advisors`, `execute_sql` for SELECTs) are fine to run freely. **STOP AND ASK for explicit approval before any direct migration to Supabase** — i.e. `apply_migration` or any write DDL/DML through `execute_sql`. This is the one MCP action that always requires a confirmation. Reason: this project tracks schema through Drizzle (hand-written SQL file + `_journal.json` entry, applied with `npx drizzle-kit migrate` — see Rule #10). Applying SQL directly through the Supabase MCP bypasses the Drizzle journal and can silently desync the DB from `src/lib/server/db/schema/**`, so it is never done silently.
- **Twilio docs** (`mcp__twilio-docs__*`) — look up Twilio API behavior, error codes, and webhook contracts before writing SMS/voice/webhook code. Do not guess Twilio specifics from memory.
- **Brevo** (`mcp__brevo__*`) — email / transactional reference. Read operations are fine for inspection. Treat any write (sending campaigns, mutating contacts/lists, templates) as an outward-facing action: do not run it without explicit approval.

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

npm run worker        # start standalone worker process (separate terminal; loads .env)

npx drizzle-kit generate   # generate migration from schema changes
npx drizzle-kit migrate    # run pending migrations
npx drizzle-kit studio     # open Drizzle Studio GUI
```

---

## Non-Negotiable Rules

These rules are never overridden by a prompt. If a task conflicts with any of these, stop and flag it.
Full patterns and code examples live in skills — these are the guardrails.

1. **Svelte 5 Runes only** — no `export let`, no `$:`, no `on:click`, no slots, no `writable`. Use `$props()`, `$state()`, `$derived()`, `$effect()`, and `$bindable()` only. For two-way bindable props, declare with `$bindable()` inside `$props()`. Details in `contractor-crm-svelte-ui` skill. Write code efficiently. Focus on performance.
2. **Tailwind CSS only** — no raw CSS files (except `app.css` for Tailwind directives and Shadcn Svelte CSS variables), no inline `style` attributes, no `<style>` blocks in `.svelte` files. All styling via Tailwind utility classes. Use the `cn()` helper for conditional classes. Shadcn Svelte components are styled through Tailwind classes and CSS variable theming defined in `app.css`. Always add required mark for mandatory form field.
3. **Mobile-first always** — 375px base, 44px touch targets, no hover-only interactions.
4. **CSR only** — `ssr = false` globally. Never use `+page.server.ts` for UI data. Never override.
5. **Server isolation absolute** — `SUPABASE_SERVICE_ROLE_KEY` never in `.svelte` or `+page.ts`. All writes go through `/api/*`. `$lib/server/*` never imported in `.svelte` files.
6. **Workers run standalone** — `npm run worker` in a separate terminal (runs `node --env-file=.env --import tsx worker.ts`; plain `npx tsx worker.ts` fails with `DATABASE_URL is required` because it skips `.env`). Never started from `hooks.server.ts`, `+layout.ts`, or any SvelteKit lifecycle.
7. **All permission checks go through `checkPermission()`** — the 40 booleans on `org_members` are sole authority. `role` column is display only. Never `if (member.role === 'admin')`.
8. **Transaction boundary law** — business mutations + `outbox_events` INSERT inside the transaction. BullMQ enqueue, Twilio, Resend, any external call OUTSIDE (via outbox worker only). Never call external services inside a transaction.
9. **Tenant isolation absolute** — every table has `org_id`, every query filters by it. RLS enforces at DB layer. API layer also enforces.
10. **Schema is authoritative** — do not invent columns, tables, or enums. If something seems missing, ask. Read the relevant schema section before writing any DB logic.
    - **You own the migration lifecycle.** Any time you edit a file under `src/lib/server/db/schema/**`, you must — in the same turn, without waiting for the user to ask — run `npx drizzle-kit generate` to produce the migration SQL, review it, then run `npx drizzle-kit migrate` to apply it. Never leave a schema change uncommitted to the DB and never instruct the user to "run the migration" themselves. If `generate` produces nothing or `migrate` fails, surface the error and stop — do not ship the feature claiming success while the DB is out of sync with the code.
11. **Outbox pattern non-negotiable** — business events flow through `outbox_events` → outbox worker → BullMQ. Never trigger automations, SMS, or emails directly from route handlers.
12. **`/jafar` completely isolated** — separate `jafarSession` cookie, no `org_id`, no `org_members` row, no Supabase auth. Never check jafar session in contractor middleware. Never mix.
13. **Client-side auth guard mandatory** — `hooks.server.ts` protects initial load + API routes. `/(app)/+layout.svelte` protects client-side navigation. Both required. Neither replaces the other.
14. **API error response shape is fixed** — every `/api/*` error response must use this exact shape:
    ```ts
    // Error
    { error: string; field_errors?: Partial<Record<string, string>>; }
    // Success with data
    { data: T }
    // Success with no body: return 204
    ```
    Never use `message`, `msg`, `details`, or any other top-level key. `field_errors` keys match the form field names exactly. UI reads `error` for toast messages and `field_errors` to map to inline field errors.
15. **List stores cache per filter key** — every tabbed/filtered list page (contacts, jobs, invoices, quotes, appointments, etc.) uses a `SvelteMap` keyed by the filter combination, with stale-while-revalidate semantics. Never single-slot caching. Never refetch on tab switch when cached. Always render `EmptyState` (never a stuck skeleton) when `items.length === 0 && status !== 'loading'`. Full pattern in `contractor-crm-svelte-ui` → `references/list-stores.md`. Reference implementations: `src/lib/stores/contacts.svelte.ts`, `src/lib/stores/jobs.svelte.ts`.
16. **Expert Engineer Mindset** — You are a senior developer with 20 years of experience building industry-led CRM systems. Think critically, research when needed, always prioritize performance, avoid overengineering, and design with strong UI/UX thinking from a contractor’s perspective. If you have any suggestions, present them to the user first; only implement them if permission is granted.
17. **Match effort to the task — no wasted tokens.** Size up the work before acting and spend proportionally:
    - **Trivial / single-file / low-risk** (copy edits, a Tailwind class, a small UI tweak, renaming a label, a one-line fix): act directly. Do NOT load skills, do NOT fan out exploration, do NOT spawn subagents, do NOT write long thinking. Make the change and report briefly.
    - **Standard feature work**: load ONLY the one or two specific skill reference files the task names — never the whole skill set — then implement. Read only the files you will actually touch or depend on; do not re-read files already in context.
    - **High-stakes work** (schema/migrations, permissions/auth, payments, outbox/workers, tenant isolation): this is the ONLY tier that justifies deep reading and careful step-by-step reasoning. Be thorough here — these rules above demand it.
    - **Stop conditions:** if you've understood the task, stop investigating and act. Don't re-derive context you already have, don't explore "just to be safe" on low-risk work, and don't keep thinking once the path is clear. When the user interrupts, treat it as a signal you were over-investigating — switch to acting.
    - Skills and deep reasoning are tools with a cost. Use them where the rules require it (high-stakes tiers), not by default.

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

- Prefer explicit over clever. No generic builders, factories, or plugin systems. Always focus on best performance for Database calling and for code.
- No reusable abstractions until duplication is proven across 3+ use cases.
- Every `POST` and `PATCH` route validates input with Zod. Phone: E.164 normalized. Money: reject negatives, `numeric(12,2)`.
