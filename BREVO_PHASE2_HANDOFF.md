# Brevo Phase 2 — Handoff (inbound still to finish)

> Read this top to bottom before touching anything. It is self-contained.
> Companion docs: `PLAN.md` (Phase 1), the approved Phase 2 plan, and the memory
> notes `brevo-email-model.md` + `brevo-inbound-todo.md`.

## Status (2026-06)

Phase 2 migrated all email from **Resend → Brevo**. Code is complete, type-checks
clean, migration `0049_brevo_phase2.sql` is applied.

- ✅ **Outbound**: We setup 'contact.upliftcontractor.com' from '/jafar' route for a organization that is the only organization right now testing. But outbound email is going from 'test.upliftcontractor.com' which I used earlier before brevo with Resend.
- ✅ **System email** routes through Brevo. ✅ **Resend fully removed.**
- ❌ **Inbound: NOT WORKING.** When a customer replied, the reply went to the same subdomain 'test.upliftcontractor.com'.

## Architecture in one screen

`email_domains` (one row per org): `domain` (verified **sending** subdomain),
`inbound_domain` (**receiving** = `inbound.<domain>`, auto-derived — Brevo refuses
to receive on the sending domain), `inbound_webhook_token` (path auth),
`brevo_inbound_webhook_id`, `status` (outbound only at `verified`).

- **Outbound:** worker → loads row (must be `verified`) → From on `domain`,
  Reply-To `r_xxx@<inbound_domain>` → `sendBrevoEmail` (POST `/v3/smtp/email`).
- **Inbound:** Brevo parses mail to `<inbound_domain>` → POSTs
  `/api/webhooks/brevo/inbound/{token}/{domain}` → org resolved by
  `(inbound_domain=domain AND inbound_webhook_token=token)` → `processBrevoInbound`
  threads (reply alias → In-Reply-To/References → sender contact).
- **Delivery events:** account-wide `/api/webhooks/brevo/events/{secret}`.
- **Webhook registration:** in the Verify route when the domain turns `verified`.

### Key files

| Concern                                            | File                                                                |
| -------------------------------------------------- | ------------------------------------------------------------------- |
| Schema                                             | `src/lib/server/db/schema/14_email_domains.ts`                      |
| Brevo REST helper                                  | `src/lib/server/email/brevo/request.ts`                             |
| Send (Reply-To built here)                         | `src/lib/server/email/brevo/send.ts`                                |
| Webhook reg + attachment download                  | `src/lib/server/email/brevo/webhooks.ts`                            |
| Domain create / DNS records / `inboundDomainFor()` | `src/lib/server/email/brevo/client.ts`                              |
| Inbound processor                                  | `src/lib/server/email/brevo/inboundProcessor.ts`                    |
| Inbound route                                      | `src/routes/api/webhooks/brevo/inbound/[token]/[domain]/+server.ts` |
| Events route                                       | `src/routes/api/webhooks/brevo/events/[secret]/+server.ts`          |
| Verify (registers webhooks)                        | `src/routes/api/admin/orgs/[id]/email-domain/verify/+server.ts`     |
| Worker (builds From + Reply-To)                    | `src/lib/server/workers/emailWorker.ts`                             |
| Reply-To + From construction                       | `src/lib/server/email/conversationEmails.ts`, `senderAddresses.ts`  |
| Inbound correlation                                | `src/lib/server/email/inboundCorrelation.ts`                        |
| jafar panel                                        | `src/lib/components/jafar/EmailDomainPanel.svelte`                  |

## Manual one-time setup still outstanding

- Confirm `SYSTEM_FROM_EMAIL`'s domain is a verified **sender** in Brevo, or system
  mail (password resets etc.) will fail.

## Nice-to-have follow-ups (not blockers)

- Surface `data.webhook_error` from the Verify response in the jafar panel.
- Show inbound webhook health (registered? last inbound received?) in the panel.

## Env (in `.env`)

`BREVO_API_KEY` ✅, `BREVO_EVENTS_WEBHOOK_SECRET` ✅, `SYSTEM_FROM_EMAIL` ✅,
`APP_URL` (must be publicly reachable for inbound). Removed: all `RESEND_*`,
`EMAIL_APEX_DOMAIN`, `EMAIL_REPLY_DOMAIN`.

## Regression check

`npm run check` → 60 pre-existing errors in unrelated files (booking pages, telnyx);
**zero in any email/brevo file**. `npx prettier --check` clean on touched files.
