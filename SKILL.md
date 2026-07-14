# CLAUDE.md

This file governs how Claude Code works in this repository.
Read this file completely before starting any task.

---

## This business is DFY for Contractors, and this CRM is a core part of that business. The CRM must always be built from the contractor's perspective, with easy-to-use workflows, excellent UI/UX, and industry-proven features. No guesswork. No reinventing the wheel unless there is a clear improvement. Target users include fence contractors, lawn care, home service pros, handymen, electricians, plumbers, cleaners, landscapers, tile contractors, remodelers, HVAC, roofing, general contractors, home builders, junk removal, and 50+ other contractor and home service industries.

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
| **Target contractors**                            | `contractor-crm/references/contractors.md`    |

### UI Design & Aesthetics (`contractor-crm-design`)

Two reference screenshots live at `assets/reference-dashboard.webp` and `assets/reference-pipeline.webp` inside the skill folder — view them before building anything new. They are the ground truth for what "done well" looks like.

| Working on...                                          | Reference File                   |
| ------------------------------------------------------ | -------------------------------- |
| **Tokens**, CSS variables, colors, spacing, shadows    | `references/tokens.scss`         |
| **Components**, buttons, badges, cards, sidebar, forms | `references/components.md`       |
| **Layout Patterns**, sidebar, topbar, grids, pipeline  | `references/layout-patterns.md`  |
| **Visual Reference**, screenshot element index         | `references/visual-reference.md` |

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
1. **Svelte 5 Runes only** — no `export let`, no `$:`, no `on:click`, no slots, no `writable`. Use `$props()`, `$state()`, `$derived()`, `$effect()`, and `$bindable()` only. For two-way bindable props, declare with `$bindable()` inside `$props()`. Details in `contractor-crm-svelte-ui` skill. Write code efficiently. Focus on performance.
1. SCSS with BEM only. Desktop design first. Always use remix icon. If you see any inline svg remove and use remix icon. **The Styling Law:** any BEM class used by 2+ components MUST be defined in a global `src/lib/styles/components/_*.scss` partial, never in a component's scoped `<style>` (Svelte's scope hash makes a scoped class apply to only that one component — the others ship unstyled and it compiles clean). See `.claude/skills/contractor-crm-design/references/ui-primitives.md`.

1. For any Async operation like: create, read, delete, update... alwasy shows a loading animation whether by animated button or popup until the operation is finished
1. Alwasy use bits ui component for Calender, Time picker, dropdown, select/option etc.. whatever exist. Never a native `<input type="date"|"time"|"datetime-local">` or native `<select>`. The canonical built primitives + import paths are in the **UI Primitives Registry**: `.claude/skills/contractor-crm-design/references/ui-primitives.md` (grep `src/lib/components/ui/` before hand-rolling anything).
1. **SSR layout shell, CSR page content** — The `/(app)/+layout.svelte` shell (sidebar, nav, session) is server-side rendered for instant first paint. All page content lives under `/(app)/(pages)/` and is CSR only — no `+page.server.ts` for page data, no store reads during SSR. The root `+layout.ts` does NOT set `ssr = false`; the `(pages)` group layout does. In `/(app)/+layout.ts`, always guard `sessionStore.update()` with a `browser` check to prevent module-level state leaking between server requests. `$lib/server/*` remains forbidden in `.svelte` files and `+page.ts`.
1. **Server isolation absolute** — `SUPABASE_SERVICE_ROLE_KEY` never in `.svelte` or `+page.ts`. All writes go through `/api/*`. `$lib/server/*` never imported in `.svelte` files.
1. **Workers run standalone** — `npm run worker` in a separate terminal (runs `node --env-file=.env --import tsx worker.ts`; plain `npx tsx worker.ts` fails with `DATABASE_URL is required` because it skips `.env`). Never started from `hooks.server.ts`, `+layout.ts`, or any SvelteKit lifecycle.
1. **All permission checks go through `checkPermission()`** — the 40 booleans on `org_members` are sole authority. `role` column is display only. Never `if (member.role === 'admin')`.
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
1. **Match effort to the task — no wasted tokens.** Size up the work before acting and spend proportionally:
   - **Trivial / single-file / low-risk** (copy edits, a Tailwind class, a small UI tweak, renaming a label, a one-line fix): act directly. Do NOT load skills, do NOT fan out exploration, do NOT spawn subagents, do NOT write long thinking. Make the change and report briefly.
   - **Standard feature work**: load ONLY the one or two specific skill reference files the task names — never the whole skill set — then implement. Read only the files you will actually touch or depend on; do not re-read files already in context.
   - **High-stakes work** (schema/migrations, permissions/auth, payments, outbox/workers, tenant isolation): this is the ONLY tier that justifies deep reading and careful step-by-step reasoning. Be thorough here — these rules above demand it.
   - **Stop conditions:** if you've understood the task, stop investigating and act. Don't re-derive context you already have, don't explore "just to be safe" on low-risk work, and don't keep thinking once the path is clear. When the user interrupts, treat it as a signal you were over-investigating — switch to acting.
   - Skills and deep reasoning are tools with a cost. Use them where the rules require it (high-stakes tiers), not by default.
1. **Plain English Always** — When explaining problems, plans, proposals, errors, or architectural decisions, lead with a plain-English summary that a non-technical person can understand. If a technical term must be used (e.g. "RLS", "idempotency", "outbox pattern", "migration", "middleware"), define it immediately in plain language — either in parentheses or a short follow-up sentence using everyday words. Never assume I already know what a term means. The goal is that I understand _what_ you are doing and _why_, not just accept your output on faith.
1. **Plain English First, Always** — Before giving any plan, fix, proposal, or explanation, Claude must first summarize it in plain English that a non-technical person can understand. If technical words are necessary, they must be explained immediately in simple everyday language. Claude must not assume the user knows the jargon.
1. **Industry-First Feature Design** — Before proposing or building a new feature or workflow or reading an existing feature/workflow, first explain how leading contractor/CRM platforms (Jobber, Housecall Pro, GoHighLevel, Pipedrive, HubSpot etc Contractor friendly CRM) solve the same problem. Explain it in plain English. Prefer the proven industry pattern unless there is a clear reason to improve or deviate from it. Do not reinvent battle-tested workflows without justification.

1. For any bigger work/task if you think it is better to split the task in multi session for better performance and avoid token waste, then you split the task for multi session like 1.1, 1.2 and save in memory with necessary context. Then do each task in each new session and tell the user to start new session when task is complete. And once all the task are done then clear from the memory

1. **Unified create/edit + inline detail — the "Model 1" standard for EVERY entity.** This is the app-wide UX pattern (proven by Jobber, Housecall Pro, Pipedrive, HubSpot), and it applies to Contacts, Invoices, Quotes, Jobs, Appointments, and every other entity that has create/edit screens — not just Contacts. When building or reworking any entity's create/edit/detail experience, follow this model unless the user explicitly says otherwise:
   - **Lean create:** "New X" is a short form of essentials only, with the rest behind a "More details" expander. Not a giant form.
   - **Detail page IS the edit surface:** click any field on the detail page to edit it in place (inline). There is **no separate full-page `/edit` route** — the preview page and the edit page are the same page.
   - **Jobber-style detail layout:** two-rail desktop (left identity rail + main column of stacked section cards + right notes/reminders rail), money actions pinned top-right (New Quote/Job/Invoice), **no tabs** for the primary sections.
   - **Before deleting any legacy `/edit` route,** first confirm every field it edits is reachable inline on the detail page; never remove the route while a field would be left uneditable.
   - Roll this out entity by entity. Full spec + rollout status lives in memory: `unified-create-edit-inline-pattern.md`. Always follow Rule 21 (industry-first) — check how the top CRMs do that specific entity before building.

1. **Build shared once, reuse everywhere — flag duplication, never silently recreate.** A UI piece or logic used in 2+ places (button, badge, card, pencil/edit control, picker, formatter, fetch pattern) must live in ONE shared component/util that every site imports — not copy-pasted per screen. This is the component-level twin of Rule 2 (the Styling Law's CSS-level version).
   - **Before hand-writing any UI or helper, check if it already exists** — grep `src/lib/components/` (and `src/lib/` for utils) for the thing first. If a component/util already does it, import it; extend it with a prop/variant rather than forking a near-copy.
   - **When you notice the SAME markup/logic pasted across 3+ files** (existing code or something you're about to add), STOP and flag it to the user in plain English: name the duplicated piece, list the copy sites, and propose the single shared component to extract. Do NOT silently duplicate it, and do NOT silently go refactor many files either — propose first, then act on the user's call (they may want it deferred to a fresh session per Rule 22).
   - **Balance with Rule 17 (avoid overengineering):** the trigger is _proven_ duplication (3+ real uses), not speculative reuse. Don't invent abstractions for a single use. Genuinely different needs are handled by a prop/variant on the one component, not a second near-identical component.

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
