import { pgTable, uuid, text, timestamp, uniqueIndex, index } from 'drizzle-orm/pg-core';
import type { InferSelectModel, InferInsertModel } from 'drizzle-orm';
import { organizations } from './01_org_identity';
import { emailDomains } from './14_email_domains';

// Additional branded From-addresses an org can send customer email from, on top of
// its single default address (organizations.email_sender_local). All addresses live
// on the org's one verified sending domain (email_domains.domain) — adding a new
// local-part on an already-verified domain needs NO DNS, so this is contractor
// self-service (unlike domain structure changes, which stay PO-gated).
//
// The DEFAULT address is NOT stored here — it remains organizations.email_sender_local
// (edited on the Stage 1 settings UI), so it keeps working before any domain exists
// and Stages 1–3 are untouched. This table holds ONLY the extra addresses
// (e.g. sales@, support@); the composer offers the default plus these.
export const emailSenderAddresses = pgTable(
	'email_sender_addresses',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		org_id: uuid('org_id')
			.notNull()
			.references(() => organizations.id, { onDelete: 'cascade' }),
		// The org's verified sending domain these addresses sit on. One domain per org
		// today (email_domains is unique on org_id), but the FK keeps the link explicit
		// and cascades a teardown if the domain row is ever removed.
		email_domain_id: uuid('email_domain_id')
			.notNull()
			.references(() => emailDomains.id, { onDelete: 'cascade' }),
		// Local-part before the @. Validated lowercase [a-z0-9-], no leading/trailing
		// hyphen, in lock-step with the localPart() sanitizer in senderAddresses.ts.
		local_part: text('local_part').notNull(),
		// Optional friendly label shown in the composer picker, e.g. "Sales".
		label: text('label'),
		created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [
		// No two extra addresses share a local-part within an org. (Collision with the
		// default address is checked in the API, since the default lives elsewhere.)
		uniqueIndex('email_sender_addresses_org_local_uq').on(t.org_id, t.local_part),
		index('email_sender_addresses_org_idx').on(t.org_id)
	]
);

export type EmailSenderAddress = InferSelectModel<typeof emailSenderAddresses>;
export type NewEmailSenderAddress = InferInsertModel<typeof emailSenderAddresses>;
