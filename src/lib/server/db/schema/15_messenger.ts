import { pgTable, pgEnum, uuid, text, boolean, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import type { InferSelectModel, InferInsertModel } from 'drizzle-orm';
import { organizations, orgMembers } from './01_org_identity';
import { contacts } from './02_contacts';

// Connection lifecycle of a contractor's Facebook Page link.
//   connected    → page linked, token stored, subscribed to the app webhook
//   disconnected → contractor revoked / we unsubscribed; row kept for audit
//   error        → token invalid or webhook subscription failed
export const messengerIntegrationStatusEnum = pgEnum('messenger_integration_status', [
	'connected',
	'disconnected',
	'error'
]);

// One Facebook Page per org (multi-tenant under a single Meta App). `page_id` is
// the canonical inbound routing key: the webhook reads entry.id → page_id → org.
export const messengerIntegrations = pgTable(
	'messenger_integrations',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		org_id: uuid('org_id')
			.notNull()
			.references(() => organizations.id, { onDelete: 'cascade' }),
		// Meta Page id — globally unique; maps inbound webhook payloads to this org.
		page_id: text('page_id').notNull(),
		page_name: text('page_name'),
		// Long-lived Page access token used for outbound Graph API sends. Secret.
		page_access_token: text('page_access_token').notNull(),
		// Often null (page tokens derived from long-lived user tokens don't expire),
		// but stored when Meta returns an expiry so the worker can flag staleness.
		token_expires_at: timestamp('token_expires_at', { withTimezone: true }),
		status: messengerIntegrationStatusEnum('status').notNull().default('connected'),
		// True once POST /{page_id}/subscribed_apps (subscribed_fields=messages) succeeds.
		subscribed: boolean('subscribed').notNull().default(false),
		connected_by: uuid('connected_by').references(() => orgMembers.id),
		deleted_at: timestamp('deleted_at', { withTimezone: true }),
		created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [
		uniqueIndex('messenger_integrations_org_id_uq').on(t.org_id),
		uniqueIndex('messenger_integrations_page_id_uq').on(t.page_id)
	]
);

export type MessengerIntegration = InferSelectModel<typeof messengerIntegrations>;
export type NewMessengerIntegration = InferInsertModel<typeof messengerIntegrations>;

// PSID-as-contact-identifier store for the Messenger channel. PSID is page-scoped,
// so identity is keyed by (org_id, page_id, psid). Kept off `contacts` so the
// phone dedup model stays clean; one contact may also have phone/email identities.
export const messengerContacts = pgTable(
	'messenger_contacts',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		org_id: uuid('org_id')
			.notNull()
			.references(() => organizations.id),
		page_id: text('page_id').notNull(),
		psid: text('psid').notNull(),
		contact_id: uuid('contact_id')
			.notNull()
			.references(() => contacts.id),
		created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [uniqueIndex('messenger_contacts_identity_uq').on(t.org_id, t.page_id, t.psid)]
);

export type MessengerContact = InferSelectModel<typeof messengerContacts>;
export type NewMessengerContact = InferInsertModel<typeof messengerContacts>;
