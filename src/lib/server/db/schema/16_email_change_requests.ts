import { pgTable, pgEnum, uuid, text, timestamp, index } from 'drizzle-orm/pg-core';
import type { InferSelectModel, InferInsertModel } from 'drizzle-orm';
import { organizations, orgMembers } from './01_org_identity';

// Contractor-submitted request to set up or change their branded email sending
// domain. The PO holds DNS for every contractor domain in their own Cloudflare, so
// domain structure is NEVER self-service — contractors file a request and the PO
// performs the change manually in /jafar. This table is the durable record; the PO
// is notified by system email via the `email_domain.change_requested` outbox event
// (mirrors the carrier.submitted flow).
//
// new_domain    → org has no email_domains row yet; wants one set up
// change_domain → org already has a verified/pending domain; wants it changed (e.g.
//                 apex sending, different root, different prefix)
export const emailChangeRequestTypeEnum = pgEnum('email_change_request_type', [
	'new_domain',
	'change_domain'
]);

// pending    → filed by the contractor, PO has not looked yet
// in_review  → PO is working on it (set manually in /jafar later)
// completed  → PO applied the change
// rejected   → PO declined (e.g. domain not owned / invalid)
export const emailChangeRequestStatusEnum = pgEnum('email_change_request_status', [
	'pending',
	'in_review',
	'completed',
	'rejected'
]);

export const emailChangeRequests = pgTable(
	'email_change_requests',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		org_id: uuid('org_id')
			.notNull()
			.references(() => organizations.id, { onDelete: 'cascade' }),
		// Who filed it — display/audit only.
		requested_by_member_id: uuid('requested_by_member_id')
			.notNull()
			.references(() => orgMembers.id),
		request_type: emailChangeRequestTypeEnum('request_type').notNull(),
		// Root domain the contractor wants to send from, e.g. upliftcontractor.com.
		desired_domain: text('desired_domain').notNull(),
		// Optional preferred local-part, e.g. info. Null = let the PO decide.
		desired_local_part: text('desired_local_part'),
		// Optional free-text note to the PO.
		note: text('note'),
		status: emailChangeRequestStatusEnum('status').notNull().default('pending'),
		resolved_at: timestamp('resolved_at', { withTimezone: true }),
		created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [index('email_change_requests_org_id_created_idx').on(t.org_id, t.created_at)]
);

export type EmailChangeRequest = InferSelectModel<typeof emailChangeRequests>;
export type NewEmailChangeRequest = InferInsertModel<typeof emailChangeRequests>;
