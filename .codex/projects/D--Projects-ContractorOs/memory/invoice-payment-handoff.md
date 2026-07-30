# Invoice payment work handoff

Date: 2026-07-24

## Current state

- The repository contains substantial unfinished invoice work from the previous Claude Code session.
- `Invoice.md` documents invoice signatures, payment blocks, manual payment entry, payment methods, invoice statuses, and jobs-list billing badges.
- Jobber references were reviewed, especially `.codex/skills/contractor-crm/references/jobber/jobber-05-invoices-payments.md`.
- `src/lib/server/invoices/recalc.ts` derives invoice totals and balance from the payment ledger. Tips are separate from the invoice balance.
- Invoice statuses now use: `draft`, `sent_not_due`, `awaiting_payment`, `paid`, `past_due`, `bad_debt`.
- Manual payment creation rejects an amount above the current `amount_due` while holding the invoice row lock.
- Manual payment PATCH/DELETE routes currently exist:
  - `src/routes/api/invoices/[id]/payments/[paymentId]/+server.ts`
  - `src/routes/api/invoices/[id]/record-payment/+server.ts`
- `payments` has no `deleted_at`, no adjustment type, and no refund/reversal columns. The project business rules describe payments as immutable financial records, which conflicts with the current manual edit/delete UI and routes.

## Completed in this session

- Added a Stripe webhook guard in `src/routes/api/webhooks/stripe/+server.ts`.
- The webhook now rejects a captured balance amount when it exceeds the invoice's current balance, including partial-payment races. It also rejects zero-balance captures.
- The rejected charge is not inserted into `payments`; the log instructs that it must be refunded in Stripe.
- Prettier and ESLint passed for the Stripe webhook file.

## Important unresolved decision

Design and implement an append-only payment adjustment model before removing manual edit/delete behavior. Safe direction:

1. Preserve original payment rows permanently.
2. Represent refunds/reversals as new ledger rows or a dedicated adjustment table with explicit type and signed/absolute amount semantics.
3. Recalculate invoice balance from the complete ledger, not denormalized fields.
4. Keep tips separate from invoice principal.
5. Add transaction locking and outbox events for payment reversal/refund actions.
6. Update the invoice UI to show reversal/refund actions instead of destructive delete/edit actions.

Do not invent columns or apply a migration until the schema design is confirmed against the existing `06_revenue.ts` schema and business rules. Any schema edit requires `npx drizzle-kit generate`, review of the generated SQL, then `npx drizzle-kit migrate` in the same turn.

## Verification caveat

- `npm run check` is currently not clean: 63 errors and 59 warnings were reported. Visible unrelated failures include malformed `src/lib/types/supabase.ts`, Telnyx webhook casts, and booking-settings Select types. Do not assume the whole repository is green.

## Suggested next session

Start by inspecting the complete payment UI/API flow and deciding between:

- a dedicated `payment_adjustments` table, or
- extending `payments` into an append-only adjustment ledger.

Then present the chosen accounting model plainly before editing the schema or generating a migration.
