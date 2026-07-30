# Communication Preference Engine Handoff

Date: 2026-07-26

## Product direction

Build the full GHL-style communication preference engine, not a narrow review-toggle V1.

The engine answers:

`Can this contact receive this communication, through this channel, for this purpose, right now?`

## Proven pattern

HighLevel models DND at the contact level with:

- global DND
- per-channel DND
- inbound/outbound direction
- workflow action to enable/disable DND
- audit attribution showing user/workflow/contact/provider source
- automatic exclusion from matching sends/workflows

Jobber also confirms review requests are a separate per-client communication preference, not just a global SMS opt-out.

## Session split

1. Schema foundation:
   - `contact_communication_preferences`
   - `contact_communication_preference_events`
   - `contact_communication_consents`
   - backfill from `contacts.sms_opt_out`, `contacts.email_opt_in`, `contacts.do_not_contact`, `contacts.receives_review_requests`
2. Central eligibility service:
   - one server helper for channel/category/direction checks
   - strict precedence: global/permanent blocks, channel, category, consent, reachability
3. Backend enforcement:
   - replace scattered boolean checks in review, quote, invoice, appointment, job, inbox, and automation sends
4. Mutation API + audit:
   - GHL-style enable/disable DND endpoints
   - immutable event history
   - outbox event `contact.communication_preference_changed`
5. Workflow integration:
   - workflow DND action
   - preference changed trigger/filter
   - email bounce / SMS provider failures can apply channel DND
6. Contact UI:
   - Communication Preferences panel
   - global DND, channel DND, category preferences, source/reason/last changed/permanent
7. Send UI:
   - show consistent blocked/unavailable reasons across all send surfaces
8. Tests and migration verification:
   - precedence, review opt-out, STOP, bounce, global DNC, workflow DND, merge behavior

## Session 1 implementation note

The old booleans remain temporarily for compatibility. The new preference/consent tables become authoritative only after the central eligibility service and send-path enforcement are wired.

## Session 2 implementation note

Added the central server-side eligibility service:

- `src/lib/server/communication-preferences/eligibility.ts`
- `src/lib/server/communication-preferences/index.ts`

Primary API:

`canContactReceiveCommunication({ orgId, contactId, channel, direction, category, now?, conversationId? })`

GHL mapping:

- `contact_communication_preferences.status = 'blocked'` means active DND.
- `status = 'allowed'` means inactive DND.
- `status = 'permanent'` means hard DND/provider opt-out and blocks any matching send.
- DND can match global `all/all/all`, channel, inbound/outbound direction, category, or exact combinations.

Current precedence:

1. active global DND blocks first
2. active permanent matching DND blocks next
3. active scoped matching DND blocks next
4. consent blocks/revocations are evaluated separately from DND
5. opt-in is required only for `marketing` category right now; service/transactional categories proceed unless consent is revoked/opted out
6. reachability checks run after DND/consent:
   - SMS: phone, released-phone sentinel, org SMS gate, Twilio number, carrier approval
   - email: email address and verified org email domain
   - call: phone/released-phone
   - Messenger/webchat: org feature flag and contact/session identity
   - WhatsApp/GBP currently return not-configured reachability blocks because no sending integration exists yet
7. SMS quiet hours return a temporary `timing` block with `retryAt`; SMS credit and rate-limit reservations remain in the SMS worker because they mutate state atomically.

Send paths were intentionally not replaced yet. Next session should wire this helper into review, quote, invoice, appointment, job, inbox, and automation sends, while preserving worker-side credit/rate-limit reservation.

## Session 3 implementation note

Wired `canContactReceiveCommunication()` into customer send enforcement:

- review request, resend, and nudge routes
- quote send/resend validation
- shared invoice send validation and payment receipt delivery
- job on-my-way and inbox message sends
- automation confirmations and sequence-driven follow-ups
- final SMS, email, and Messenger worker gates before provider delivery

The existing SMS worker-side quiet-hours, rate-limit, and credit reservation checks remain in place. Queue source labels now map to communication categories through `category.ts`, and queued messages are re-evaluated at provider-send time so a newly applied GHL-style DND cannot be bypassed.

## Session 4 implementation note

Added the GHL-style mutation and audit layer:

- `src/lib/server/communication-preferences/mutations.ts` provides transactional preference/consent updates and preference reads.
- `src/lib/server/communication-preferences/access.ts` centralizes contact access and `checkPermission()` enforcement.
- `POST /api/contacts/[id]/communication-preferences` enables/disables global or scoped DND with authenticated user attribution.
- `GET /api/contacts/[id]/communication-preferences` returns current preference scopes, consents, and immutable event history.
- `POST /api/contacts/[id]/communication-preferences/consents` records consent state separately from DND.
- Real DND changes insert the preference row update, immutable audit event, and `contact.communication_preference_changed` outbox event in one transaction.
- Permanent DND cannot be cleared through the user API.

No schema migration was needed in Session 4 because Session 1's communication-preference tables already contain the required fields.

## Session 5 implementation note

Completed the GHL compatibility and lifecycle audit:

- Legacy contact PATCH fields now mirror into authoritative DND/consent records in the same transaction:
  - `do_not_contact` → global all-channel DND
  - `email_opt_in` → email marketing consent
  - `receives_review_requests` → outbound review-request preference
- Permanent Twilio SMS failures and permanent Brevo email failures also update legacy fields for compatibility while the new preference rows remain authoritative.
- Contact merges now reparent communication preferences, consents, and audit history. Conflicts keep the stricter state: permanent > blocked > allowed, and revoked/opted-out > opted-in > unknown.
- `changeCommunicationConsentInTransaction()` was added so consent updates can share an existing business transaction.
- `npm run build` passes. Full `tsc` still reports unrelated pre-existing errors in job form typing, several admin route handler types, and Telnyx payload casts.

## Session 6 implementation note

Completed the remaining HighLevel DND parity hardening:

- Inbound DND mutations now reject unsupported channel/category scopes. Inbound DND is global, matching HighLevel's current inbound calls/SMS behavior.
- Twilio inbound SMS checks inbound DND before creating inbox, conversation, lead, or automation activity. STOP and START compliance keywords remain processable.
- Twilio missed-call handling checks inbound call DND before creating a contact, conversation, or missed-call activity.
- DND preference changes are now included in the existing dashboard activity feed with contact route and source attribution (user, workflow, provider, customer, or system).
- Workflow schema/runtime validation rejects inbound specific-channel DND actions.

Verification:

- `npm run build` passes.
- `npm run check` still reports the repository's unrelated pre-existing errors (40 errors / 59 warnings), including Telnyx payload casts and booking Select numeric values. No Session 6 files appear in those errors.
- No schema change was required, so no new Drizzle migration was generated or applied.
