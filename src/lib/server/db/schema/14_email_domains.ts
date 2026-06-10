import {
	pgTable,
	pgEnum,
	uuid,
	text,
	boolean,
	jsonb,
	timestamp,
	uniqueIndex
} from 'drizzle-orm/pg-core';
import type { InferSelectModel, InferInsertModel } from 'drizzle-orm';
import { organizations } from './01_org_identity';

// Per-tenant sending/receiving email domain registered with Brevo.
// PO-operated via /jafar. One row per org in Phase 1.
//
// pending     → row created with Brevo, DNS records not confirmed yet
// verifying   → PO added DNS + clicked Verify; Brevo has not confirmed yet
// verified    → Brevo confirms verified + authenticated → "Email ready"
// failed      → a verify attempt ran but Brevo still reports not verified
export const emailDomainStatusEnum = pgEnum('email_domain_status', [
	'pending',
	'verifying',
	'verified',
	'failed'
]);

// A single DNS record the PO must paste into the contractor's DNS provider.
// Stored as jsonb so the panel is rebuildable without re-calling Brevo.
export type EmailDnsRecord = {
	type: 'TXT' | 'MX' | 'CNAME';
	host: string; // host_name to create the record at
	value: string; // record value
	priority?: number; // MX priority (inbound only)
	purpose: 'dkim' | 'brevo_code' | 'dmarc' | 'inbound_mx';
	label: string; // human label for the UI row
	// Which domain this record belongs to — drives the panel's Sending/Receiving
	// grouping. Optional for backward-compat with rows written before this field:
	// readers fall back to inbound_mx → receiving, everything else → sending.
	scope?: 'sending' | 'receiving';
	// For records Brevo verifies (DKIM / brevo-code): its last-known status.
	status?: boolean;
};

export const emailDomains = pgTable(
	'email_domains',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		org_id: uuid('org_id')
			.notNull()
			.references(() => organizations.id, { onDelete: 'cascade' }),
		// Source-of-truth inputs the PO types in /jafar. The two full domains below
		// are derived from these (no nesting):
		//   domain         = sending_prefix ? `${sending_prefix}.${root_domain}` : root_domain
		//   inbound_domain = `${inbound_prefix}.${root_domain}`
		// e.g. root upliftcontractor.com + prefixes contact/replies →
		//   contact.upliftcontractor.com  and  replies.upliftcontractor.com
		// sending_prefix is NULLABLE: when absent the org sends from the apex/root
		// (info@upliftcontractor.com). The receiving prefix stays required — Brevo
		// inbound MX can never sit on the apex without hijacking the contractor's
		// real mailbox, so replies always land on a dedicated sibling subdomain.
		root_domain: text('root_domain').notNull(),
		sending_prefix: text('sending_prefix'),
		inbound_prefix: text('inbound_prefix').notNull(),
		// Sending subdomain, normalized lowercase (e.g. contact.joesplumbing.com).
		// Stored-derived from sending_prefix + root_domain. Verified with Brevo for
		// outbound (DKIM). Uniquely indexed.
		domain: text('domain').notNull(),
		// Receiving subdomain, normalized lowercase. Stored-derived from
		// inbound_prefix + root_domain — a sibling of the sending domain, never
		// nested under it. Brevo will not parse inbound mail on the sending domain,
		// so replies land here via MX. Canonical inbound routing key
		// (inbound_domain → org). Uniquely indexed.
		inbound_domain: text('inbound_domain').notNull(),
		// Brevo's returned domain id.
		brevo_domain_id: text('brevo_domain_id'),
		// Id of the per-org inbound parse webhook registered with Brevo (POST
		// /v3/webhooks type=inbound). Stored so registration is idempotent.
		brevo_inbound_webhook_id: text('brevo_inbound_webhook_id'),
		// Opaque secret minted at domain creation. Used in the deterministic inbound
		// path /webhooks/brevo/inbound/{token}/{domain}; the Phase 2 handler rejects
		// any request whose token doesn't match this row for that domain.
		inbound_webhook_token: text('inbound_webhook_token').notNull(),
		status: emailDomainStatusEnum('status').notNull().default('pending'),
		brevo_verified: boolean('brevo_verified').notNull().default(false),
		brevo_authenticated: boolean('brevo_authenticated').notNull().default(false),
		// DKIM, brevo-code, suggested DMARC, inbound MX — rendered in the jafar panel.
		dns_records: jsonb('dns_records').$type<EmailDnsRecord[]>(),
		last_checked_at: timestamp('last_checked_at', { withTimezone: true }),
		verified_at: timestamp('verified_at', { withTimezone: true }),
		created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [
		uniqueIndex('email_domains_org_id_uq').on(t.org_id),
		uniqueIndex('email_domains_domain_uq').on(t.domain),
		uniqueIndex('email_domains_inbound_domain_uq').on(t.inbound_domain),
		uniqueIndex('email_domains_inbound_webhook_token_uq').on(t.inbound_webhook_token)
	]
);

export type EmailDomain = InferSelectModel<typeof emailDomains>;
export type NewEmailDomain = InferInsertModel<typeof emailDomains>;
