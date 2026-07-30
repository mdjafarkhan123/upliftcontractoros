# CLAUDE.md

This file governs how Claude Code works in this repository.
Read this file completely before starting any task.

---

## Skills

Domain-specific reference skills live in `.claude/skills/`.
Load them when relevant — do not load all at once.

### Whenever a user asks about Jobber, or whenever you want to research Jobber never load from your memory first, you must first load the relevant information from the section below to get the necessary details about the Jobber CRM

#### Jobber Competitor Reference (`contractor-crm/references/jobber/`)

Before designing or reworking ANY feature, check how **Jobber** (the market-leading contractor CRM) models it, so we knowingly **match or beat** the proven pattern (Rule 21, industry-first). Plain-English reference built from Jobber's live GraphQL schema + Help/Developer Center (behavior cited; unconfirmed items marked `(unverified)`). These describe **Jobber**, not our schema — read alongside our own `references/*.md`. Start at `jobber-00` when unsure.

| Jobber's model of...                                                    | Reference File                                          |
| ----------------------------------------------------------------------- | ------------------------------------------------------- |
| **Index** — vocabulary, lead→cash lifecycle, object map, status table   | `references/jobber/jobber-00-overview-lifecycle.md`     |
| **Clients & Properties** — customer/location model, tags, custom fields | `references/jobber/jobber-01-clients-properties.md`     |
| **Requests & Leads** — work requests, assessments, online booking       | `references/jobber/jobber-02-requests-leads.md`         |
| **Quotes** — line items, good-better-best, deposits, approvals          | `references/jobber/jobber-03-quotes.md`                 |
| **Jobs, Visits & Scheduling** — one-off vs recurring, billing, calendar | `references/jobber/jobber-04-jobs-visits-scheduling.md` |
| **Invoices & Payments** — statuses, batch/progress invoicing, tips      | `references/jobber/jobber-05-invoices-payments.md`      |
| **Automations & Client Hub** — trigger/condition/action, client portal  | `references/jobber/jobber-06-automations-clienthub.md`  |
| **API model** — query/mutation catalog, pagination, webhooks, limits    | `references/jobber/jobber-07-api-mutations.md`          |

### UI Design & Aesthetics (`design`)

The `design` skill is the full component design system — deep forest-green brand, clean white surfaces, automatic dark mode. **Load its `SKILL.md` first**, then read only the module(s) your task touches. Foundation files (`layout.md`, `typography.md`, `colors.md`, `shadows.md`, `radius.md`, `borders.md`) apply to any UI work; component and CRM-specific files load per task.

**SCSS architecture** lives in `.claude/skills/design/scss/`: `_variables.scss` (raw palette + layout values — never used directly in component code), `_mixins.scss` (helpers: card-base, focus-ring, glint, etc.), `_theme.scss` (emits every `var(--token)` for light + dark), `_base.scss` (reset + base elements). Tokens are semantic CSS custom properties (`var(--brand)`, `var(--heading)`, `var(--border-default)`) — no raw hex in component code.

| Working on...                                             | Reference File                                                                                                                                                                                                                                                                                          |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Foundation** — colors, type, spacing, radius, shadow    | `brand.md` · `colors.md` · `typography.md` · `layout.md` · `radius.md` · `shadows.md` · `borders.md`                                                                                                                                                                                                    |
| **Core components** — buttons, cards, inputs, modals…     | `buttons.md`, `cards.md`, `inputs.md`, `modals.md`, `tables.md`, `sidebars.md`, `badges.md`, `tabs.md`, `dropdown.md`, `alerts.md`, `avatars.md`, `tooltips-popovers.md`, `accordion.md`, `pagination.md`, `lists.md`, `radios-checkboxes-toggle.md`, `button-group.md`, `icon-shapes.md`, `content.md` |
| **CRM-specific** — status, KPI cards, charts              | `status-indicators.md` · `stats-cards.md` · `data-display.md`                                                                                                                                                                                                                                           |
| **Project governance** — primitive registry + Styling Law | `ui-primitives.md`                                                                                                                                                                                                                                                                                      |

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

1. Update skill whenever you need
1. **Svelte 5 Runes only** — no `export let`, no `$:`, no `on:click`, no slots, no `writable`. Write code efficiently by Svelte MCP when need. Focus on performance.
1. SCSS with BEM only. **This is a DESKTOP web app — desktop is THE target, not "desktop-first then mobile." Design, tune, and verify every screen on a wide desktop viewport. Mobile/narrow layouts are a low-priority nicety, never a co-priority; never compromise the desktop design to serve mobile.** Alwasy use remix icon instead of using any raw svg.

1. For any Async operation like: create, read, delete, update... alwasy shows a loading animation whether by animated button or popup until the operation is finished
1. Alwasy use bits ui component which is available in our project.
1. **SSR layout shell, CSR page content** — The `/(app)/+layout.svelte` shell (sidebar, nav, session) is server-side rendered for instant first paint. All page content lives under `/(app)/(pages)/` and is CSR only — no `+page.server.ts` for page data, no store reads during SSR. The root `+layout.ts` does NOT set `ssr = false`; the `(pages)` group layout does. In `/(app)/+layout.ts`, always guard `sessionStore.update()` with a `browser` check to prevent module-level state leaking between server requests. `$lib/server/*` remains forbidden in `.svelte` files and `+page.ts`.
1. **Server isolation absolute** — `SUPABASE_SERVICE_ROLE_KEY` never in `.svelte` or `+page.ts`. All writes go through `/api/*`. `$lib/server/*` never imported in `.svelte` files.
1. **Workers run standalone** — `npm run worker` in a separate terminal (runs `node --env-file=.env --import tsx worker.ts`; plain `npx tsx worker.ts` fails with `DATABASE_URL is required` because it skips `.env`). Never started from `hooks.server.ts`, `+layout.ts`, or any SvelteKit lifecycle.
1. **All permission checks go through `checkPermission()`** — the 40+ booleans on `org_members` are sole authority. `role` column is display only. Never `if (member.role === 'admin')`.
1. **Transaction boundary law** — business mutations + `outbox_events` INSERT inside the transaction. BullMQ enqueue, Twilio, Resend, any external call OUTSIDE (via outbox worker only). Never call external services inside a transaction.
1. **Tenant isolation absolute** — every table has `org_id`, every query filters by it. RLS enforces at DB layer. API layer also enforces.
1. **Schema is authoritative** — do not invent columns, tables, or enums. If something seems missing, ask. Read the relevant schema section before writing any DB logic.
   - **You own the migration lifecycle.** Any time you edit a file under `src/lib/server/db/schema/**`, you must — in the same turn, without waiting for the user to ask — run `npx drizzle-kit generate` to produce the migration SQL, review it, then run `npx drizzle-kit migrate` to apply it. Never leave a schema change uncommitted to the DB and never instruct the user to "run the migration" themselves. If `generate` produces nothing or `migrate` fails, surface the error and stop — do not ship the feature claiming success while the DB is out of sync with the code.
1. **Outbox pattern non-negotiable** — business events flow through `outbox_events` → outbox worker → BullMQ. Never trigger automations, SMS, or emails directly from route handlers.
1. **`/jafar` completely isolated** — separate `jafarSession` cookie, no `org_id`, no `org_members` row, no Supabase auth. Never check jafar session in contractor middleware. Never mix.
1. **Client-side auth guard mandatory** — `hooks.server.ts` protects initial load + API routes. `/(app)/+layout.svelte` protects client-side navigation. Both required. Neither replaces the other.
1. **API error response shape is fixed** — every `/api/*` error response must use this exact shape:
   ```ts
   // Error
   { error: string; field_errors?: Partial<Record<string, string>>; }
   // Success with data
   { data: T }
   // Success with no body: return 204
   ```
   Never use `message`, `msg`, `details`, or any other top-level key. `field_errors` keys match the form field names exactly. UI reads `error` for toast messages and `field_errors` to map to inline field errors.
1. **List stores cache per filter key** — every tabbed/filtered list page (contacts, jobs, invoices, quotes, appointments, etc.) uses a `SvelteMap` keyed by the filter combination, with stale-while-revalidate semantics. Never single-slot caching. Never refetch on tab switch when cached. Always render `EmptyState` (never a stuck skeleton) when `items.length === 0 && status !== 'loading'`. Full pattern in `contractor-crm-svelte-ui` → `references/list-stores.md`. Reference implementations: `src/lib/stores/contacts.svelte.ts`, `src/lib/stores/jobs.svelte.ts`.
1. **Expert Engineer Mindset** Think critically, research when needed, always prioritize performance, avoid overengineering, and design with strong UI/UX thinking from a contractor’s perspective.
1. **Match effort to the task — no wasted tokens.**
1. Plain English First, Always — Before explaining any problem, plan, proposal, fix, error, or architectural decision, first summarize it in plain English that a non-technical person can understand. If technical terms are necessary (e.g. RLS, idempotency, middleware, migration), explain them immediately in simple everyday language. Never assume I know technical jargon. The goal is that I understand what you're doing and why, not just accept the output on faith.
1. **Industry-First Feature Design** — Before proposing or building a new feature or workflow or reading an existing feature/workflow, first explain how leading contractor/CRM platforms (Jobber, Housecall Pro, GoHighLevel, Pipedrive, HubSpot etc Contractor friendly CRM) solve the same problem. Explain it in plain English. Prefer the proven industry pattern unless there is a clear reason to improve or deviate from it. Do not reinvent battle-tested workflows without justification.

1. For any bigger work/task if you think it is better to split the task in multi session for better performance and avoid token waste, then you split the task for multi session like 1.1, 1.2 and save in memory with necessary context. Then do each task in each new session and tell the user to start new session when task is complete. And once all the task are done then clear from the memory

1. Build once, reuse everywhere — never silently duplicate. If a UI element or helper is used in multiple places, it should live in a single shared component or utility (src/lib/components/ or src/lib/). Before creating anything new, check whether it already exists and extend it with props/variants instead of creating a near-copy. If you find the same markup or logic duplicated across 3+ files, stop and tell me in plain English: what is duplicated, where it appears, and the shared component/utility you recommend extracting. Do not silently duplicate or perform large refactors—ask first. Follow Rule 17: only extract after proven reuse, not anticipated reuse.

1. **No query waterfalls — independent DB reads run concurrently.** Awaiting independent database calls one after another (`await q1; await q2; await q3`) stacks their network round-trips and is the single biggest cause of slow endpoints (it silently made `GET /api/jobs/[id]` take 3–6s — a dozen sequential trips). Rule:
   - **Independent reads MUST run in one concurrent wave** via `Promise.all([...])` (or `parallel({...})` from `$lib/server/db/parallel` for named results). Only await sequentially when a query genuinely needs a previous query's _result_ (e.g. fetch the row, then a permission check, then dependent reads).
   - **This applies to reads and independent operations ONLY.** Dependent writes inside a `db.transaction(...)` stay sequential and ordered — never parallelize transactional writes; it corrupts data. The outbox INSERT still lands in the same txn (Rule 11).
   - **Conditional/private reads** (cost-gated expenses, `canCost`) join the batch as `cond ? query : Promise.resolve(fallback)` so gating is preserved without dropping back to a waterfall.
   - **The signal:** every `/api/*` response carries a `Server-Timing: app;dur=<ms>` header (see `hooks.server.ts`) and anything over `SLOW_API_MS` logs a `slow_api` warning. If you touch an endpoint, glance at its timing; a waterfall is a defect, not a style preference. App-wide sweep status + the remaining offenders (dashboard/summary, list endpoints) live in memory: `query-performance-parallelization.md`.

---

## Implementation Workflow

For any non-trivial task:

1. State your understanding of the task
2. State your implementation plan
3. Call out risks and edge cases
4. **Wait for approval before writing code**

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

Ask: **"Task done. Anything you have in mind?"**

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
