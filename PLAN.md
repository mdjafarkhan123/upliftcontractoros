Ready for review
Select text to add comments on the plan
Plan: Per-Tenant Email Domain Onboarding (Brevo) — Phase 1 Foundation
Context
Why this is being built. The app's email stack is currently 100% Resend on a shared-domain model: every contractor sends from one platform-owned domain (acme-roofing@mail.platform.com) and inbound replies come back to opaque aliases on a shared reply domain. The user is moving to Brevo with a fundamentally different model: each contractor sends and receives on their own verified subdomain (e.g. mail.joesplumbing.com). Brevo was chosen over Postmark because it supports many sending domains cheaply and works on the free tier for development.

Operating model — DFY agency, Platform-Owner-operated. This is not a contractor self-service feature. Contractors never configure DNS. All domain onboarding is performed by the Platform Owner (PO) inside /jafar, as part of (or right after) org provisioning. Contractors may, in a future phase, see a read-only "Email ready / Setup pending" badge — that indicator is not built in Phase 1. There is no contractor-facing settings page and no contractor nav entry for this.

What this phase delivers. The reusable foundation to register a contractor's domain with Brevo from /jafar, show the PO the DNS records to paste into the contractor's DNS provider, and verify it. The user onboards their own subdomain as tenant #1 through this exact /jafar flow. The actual swap of send/receive traffic Resend → Brevo is Phase 2.

Decisions locked in with the user:

Replace Resend fully (Brevo becomes the only provider — but send/receive rewrite is Phase 2).
No shared-platform-domain fallback. Orgs send via their own verified domain (or later, Gmail).
PO-operated via /jafar only. No contractor settings UI; contractor read-only status is future.
Mint the inbound webhook token in Phase 1 (not deferred). Generated at domain creation, stored on the row. Deterministic inbound path: /webhooks/brevo/inbound/{token}/{domain}. Requests without a valid token are rejected. (Brevo's inbound payload has no signature — the path token is the only auth; never rely on IP allowlists or "trust Brevo".)
Routing rule (canonical): email_domains.domain is the lookup key for inbound routing — receiving domain → organization, never email-address parsing. Threading to the specific conversation within that org (Phase 2) then uses standard In-Reply-To/References headers or the sender's contact.
Gmail (Google OAuth) sending channel (dropdown on the chat composer's "Email" button) is a separate future phase, not built now.
Brevo facts verified from their API docs (these drive the schema):

Create domain: POST https://api.brevo.com/v3/senders/domains body { "name": "mail.joesplumbing.com" } → returns { id, domain_name, message, dns_records: { dkim_record: {type:"TXT", value, host_name:"mail.\_domainkey.", status}, brevo_code: {type:"TXT", value:"brevo-code:...", host_name:"", status} } }.
Check status: GET /v3/senders/domains/{domainName} → { domain, verified, authenticated, dns_records }.
Trigger auth check: PUT /v3/senders/domains/{domainName}/authenticate.
DMARC is recommended but not returned by create — added as a static suggested record in the UI.
Inbound parse (Phase 2): MX inbound1.sendinblue.com (prio 10) + inbound2.sendinblue.com (prio 20) on the receiving subdomain, then register POST /v3/webhooks { type:"inbound", events:["inboundEmailProcessed"], url:"<our /webhooks/brevo/inbound/{token}/{domain}>", domain }.
Free tier (300 emails/day) is fine for dev testing.
Scope of Phase 1
PO-operated domain onboarding under /jafar: register a domain with Brevo, mint + store the inbound webhook token, display the DNS records (including inbound MX, labelled for the next phase) for the PO to paste into the contractor's DNS, and verify. Outbound sender-domain authentication only. The inbound webhook handler is Phase 2 — but its token and deterministic path are established now.

Schema
New table email_domains (one row per org; org-scoped per tenant-isolation law). New file: src/lib/server/db/schema/13_email_domains.ts (confirm next free numeric prefix during implementation).

Columns (follow Drizzle conventions in 01_org_identity.ts):

id uuid PK defaultRandom()
org*id uuid NOT NULL FK → organizations.id
domain text NOT NULL — sending/receiving subdomain, normalized lowercase. Canonical inbound routing key (domain → org). Uniquely indexed.
brevo_domain_id text — Brevo's returned id
inbound_webhook_token text NOT NULL — opaque secret minted at domain creation (e.g. 32-char random). Used in the deterministic inbound path /webhooks/brevo/inbound/{token}/{domain}; Phase 2 handler rejects any request whose token doesn't match the row for that domain. Uniquely indexed.
status enum emailDomainStatusEnum: pending | verifying | verified | failed, default pending
brevo_verified boolean NOT NULL default false
brevo_authenticated boolean NOT NULL default false
dns_records jsonb — records to display (dkim, brevo_code, suggested dmarc, inbound MX) so the UI is rebuildable without re-calling Brevo
last_checked_at timestamptz
verified_at timestamptz
created_at / updated_at timestamptz default now()
Unique index on org_id (1 domain per org in Phase 1), on domain, and on inbound_webhook_token.
Migration lifecycle (critical — memory drizzle-generate-blocked): drizzle-kit generate is blocked. Hand-write the next drizzle/NNNN*\*.sql, add the matching drizzle/meta/\_journal.json entry (and snapshot per existing pattern), then run npx drizzle-kit migrate in the same turn. Do not ask the user to run it. If migrate fails, stop and surface the error — never ship with DB out of sync.

Brevo client (server-only)
New src/lib/server/email/brevo/client.ts — lazy singleton over Brevo's REST API using BREVO_API_KEY (header api-key), mirroring the lazy-init style of src/lib/server/email/client.ts (Resend). Functions:

createBrevoDomain(name) → POST create → { id, dns*records }
getBrevoDomain(name) → GET status → { verified, authenticated, dns_records }
authenticateBrevoDomain(name) → PUT authenticate
Token generation helper (crypto random) lives alongside the route or in a small src/lib/server/email/brevo/ util. Add BREVO_API_KEY to .env.example. Leave RESEND*\* in place (removed in Phase 2).

API routes — under /jafar's admin surface (NOT contractor)
All live under /api/admin/orgs/[id]/..., which hooks.server.ts already auto-protects with the jafar session (returns 401 without it). No checkPermission(), no contractor org_id context — jafar is fully isolated (CLAUDE.md rule 12). The target org is the [id] route param. Follow the fixed response shape (rule 14: { error, field_errors? } / { data } / 204), Zod-validate input.

POST /api/admin/orgs/[id]/email-domain — Zod-validate { domain } (lowercase, valid hostname, must be a subdomain). Call Brevo createBrevoDomain outside any transaction (external call — rule 8); mint inbound_webhook_token; INSERT the email_domains row with brevo_domain_id, token, and dns_records. Return { data: { domain, status, dns_records, inbound_webhook_path } }. Synchronous settings op — not an automation/business event, so no outbox/worker.
GET /api/admin/orgs/[id]/email-domain — return the org's current domain row (status + records) for the panel.
POST /api/admin/orgs/[id]/email-domain/verify — call Brevo authenticateBrevoDomain then getBrevoDomain; update brevo_verified/brevo_authenticated/status/last_checked_at/verified_at; return updated status. Drives the PO's "Verify" button (manual check — no background job in Phase 1).
DELETE /api/admin/orgs/[id]/email-domain — remove the row so the PO can redo setup. Optional but cheap; include it.
UI — panel inside the /jafar org-detail page
Add an "Email Domain" section to src/routes/jafar/orgs/[id]/+page.svelte, following the existing jafar conventions (dark theme, rounded-2xl border border-slate-800 bg-slate-900/50 section containers, red-gradient primary buttons, emerald/red alert blocks, CSR data via the jafarOrgStore pattern + $effect/$derived, refresh-after-mutation). Place it near "Lifecycle actions"/"Integration status". No +page.ts server loader (CSR only). Use contractor-crm-svelte-ui skill for Svelte 5 runes/Tailwind; this screen is dark-jafar, not the contractor design system.

Operator-facing copy (agency workflow), e.g.:

Empty: "Set up this contractor's sending email. Enter the subdomain you'll use (e.g. mail.theirbusiness.com)." required mark on the field.
After create: a records table (Type / Host / Value, each with a copy button) under the instruction: "Copy these records to the contractor's DNS provider. Click Verify once done." Include the inbound MX rows labelled "for receiving email (used next phase)". No low-level DNS explainers.
Status: plain badge — "Email ready" (verified/authenticated) vs "Setup pending — verify after DNS is added". A "Verify" button calls the verify route and toasts the result.
A small client store (e.g. extend/parallel jafarOrgStore or a dedicated jafarEmailDomain.svelte.ts) fetches/holds the domain row for the panel.

Critical files
New: src/lib/server/db/schema/13_email_domains.ts; drizzle/NNNN_email_domains.sql (+ journal/snapshot)
New: src/lib/server/email/brevo/client.ts (+ token util)
New: src/routes/api/admin/orgs/[id]/email-domain/+server.ts, .../email-domain/verify/+server.ts
Edit: src/routes/jafar/orgs/[id]/+page.svelte (add Email Domain panel); a jafar client store for the panel
Edit: .env.example (add BREVO_API_KEY)
Reference only (unchanged this phase): src/lib/server/email/senderAddresses.ts, inboundCorrelation.ts, emailWorker.ts, 05_communication.ts, src/lib/server/admin/orgProvisioning.ts
Risks / edge cases
Migration by hand: generate is blocked — journal/snapshot must be edited correctly or migrate fails. Highest-risk step; verify DB sync before claiming done.
No contractor leakage: routes are jafar-only by living under /api/admin/\*; never add a contractor /settings entry or checkPermission path for this.
Token secrecy: inbound_webhook_token is a credential — generate with crypto-strong randomness, store as-is, never expose in contractor-reachable responses (only the jafar panel sees the inbound path).
DNS propagation: verification can take minutes–48h. "Setup pending — verify after DNS is added" is a normal state, not an error.
Brevo API failure: call Brevo first, insert the row only on success, surface Brevo's message via { error }. No half-created rows.
DMARC not returned by create: present as a static suggested record.
Scope creep: do NOT touch the Resend send/receive path, build the inbound handler, or the Gmail dropdown — later phases.
Verification (end-to-end)
Run hand-written migration; confirm email_domains exists with inbound_webhook_token (drizzle studio or quick query).
npm run check + npm run lint clean.
Set BREVO_API_KEY in .env; npm run dev; log into /jafar.
Open an org at /jafar/orgs/[id] → Email Domain panel → submit your real subdomain → confirm a Brevo domain is created, a token is minted, and DNS records render with copy buttons + the "copy these to the contractor's DNS provider" instruction.
Add the records at your DNS provider (Cloudflare/GoDaddy).
Click Verify → status flips to "Email ready" once DNS propagates (cross-check in Brevo dashboard).
Confirm isolation: hitting /api/admin/orgs/[id]/email-domain without a jafar session returns 401; no contractor route exposes this.
Out of scope (future phases — noted only)
Phase 2: Swap outbound send (emailWorker → Brevo transactional email API), build the inbound webhook handler at /webhooks/brevo/inbound/{token}/{domain} (reject invalid token — no IP/trust reliance), route inbound by receiving domain → org via email_domains.domain then thread via headers/contact, per-domain from-address logic, register inbound MX + POST /v3/webhooks, retire Resend code + env vars.
Future: contractor-facing read-only "Email ready / Setup pending" indicator; Gmail (Google OAuth) sending channel via the chat composer's "Email" dropdown; possible Agency App home for this onboarding.
Add Comment
