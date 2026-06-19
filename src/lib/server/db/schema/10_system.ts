import {
	pgTable,
	pgEnum,
	uuid,
	text,
	boolean,
	integer,
	serial,
	numeric,
	jsonb,
	timestamp,
	index,
	uniqueIndex,
	check
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import type { InferSelectModel, InferInsertModel } from 'drizzle-orm';
import { organizations, orgMembers } from './01_org_identity';
import { emailDomainStatusEnum, type EmailDnsRecord } from './14_email_domains';

export const growthFeedTypeEnum = pgEnum('growth_feed_type', [
	'gbp_post',
	'seo',
	'social',
	'website',
	'blog',
	'review_response',
	'monthly_summary'
]);

export const automationJobStatusEnum = pgEnum('automation_job_status', [
	'pending',
	'processing',
	'completed',
	'failed',
	'cancelled'
]);

export const automationJobTypeEnum = pgEnum('automation_job_type', [
	'missed_call_textback',
	'speed_to_lead',
	'quote_followup',
	'invoice_reminder',
	'review_request',
	'appointment_reminder',
	'appointment_confirmation'
]);

export const outboxEventStatusEnum = pgEnum('outbox_event_status', [
	'pending',
	'processing',
	'processed',
	'failed',
	'dead_lettered'
]);

export const growthFeedItems = pgTable('growth_feed_items', {
	id: uuid('id').primaryKey().defaultRandom(),
	org_id: uuid('org_id')
		.notNull()
		.references(() => organizations.id),
	type: growthFeedTypeEnum('type').notNull(),
	title: text('title').notNull(),
	body: text('body').notNull(),
	media_url: text('media_url'),
	is_monthly_summary: boolean('is_monthly_summary').notNull().default(false),
	summary_month: integer('summary_month'),
	summary_year: integer('summary_year'),
	published_at: timestamp('published_at', { withTimezone: true }).notNull().defaultNow(),
	created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

export type GrowthFeedItem = InferSelectModel<typeof growthFeedItems>;
export type NewGrowthFeedItem = InferInsertModel<typeof growthFeedItems>;

// Agency-internal append-only log — no updated_at, no deleted_at
export const internalActivityLog = pgTable('internal_activity_log', {
	id: uuid('id').primaryKey().defaultRandom(),
	org_id: uuid('org_id')
		.notNull()
		.references(() => organizations.id),
	author_id: text('author_id').notNull(),
	activity_type: text('activity_type').notNull(),
	title: text('title').notNull(),
	body: text('body'),
	metadata: jsonb('metadata'),
	created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

export type InternalActivityLog = InferSelectModel<typeof internalActivityLog>;
export type NewInternalActivityLog = InferInsertModel<typeof internalActivityLog>;

// Dashboard Recent Activity feed — append-only, populated by outbox worker on dispatch.
// Decoupled from outbox_events so feed history survives outbox retention/cleanup.
export const activityEvents = pgTable(
	'activity_events',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		org_id: uuid('org_id')
			.notNull()
			.references(() => organizations.id, { onDelete: 'cascade' }),
		event_type: text('event_type').notNull(),
		resource_type: text('resource_type').notNull(),
		resource_id: uuid('resource_id').notNull(),
		contact_id: uuid('contact_id'),
		payload: jsonb('payload').notNull(),
		event_version: integer('event_version').notNull().default(1),
		occurred_at: timestamp('occurred_at', { withTimezone: true }).notNull(),
		created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => ({
		orgOccurredIdx: index('activity_events_org_occurred_idx').on(t.org_id, t.occurred_at.desc()),
		orgTypeOccurredIdx: index('activity_events_org_type_occurred_idx').on(
			t.org_id,
			t.event_type,
			t.occurred_at.desc()
		)
	})
);

export type ActivityEvent = InferSelectModel<typeof activityEvents>;
export type NewActivityEvent = InferInsertModel<typeof activityEvents>;

// In-app notification records — append-only, purged by cron at 90 days
export const notifications = pgTable(
	'notifications',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		org_id: uuid('org_id')
			.notNull()
			.references(() => organizations.id),
		member_id: uuid('member_id')
			.notNull()
			.references(() => orgMembers.id),
		type: text('type').notNull(),
		title: text('title').notNull(),
		body: text('body'),
		resource_type: text('resource_type'),
		resource_id: uuid('resource_id'),
		idempotency_key: text('idempotency_key'),
		read_at: timestamp('read_at', { withTimezone: true }),
		// New columns for push + batching
		metadata: jsonb('metadata').notNull().default({}),
		push_sent_at: timestamp('push_sent_at', { withTimezone: true }),
		priority: text('priority').notNull().default('normal'),
		route: text('route'),
		aggregation_count: integer('aggregation_count').notNull().default(1),
		last_event_at: timestamp('last_event_at', { withTimezone: true }).notNull().defaultNow(),
		created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [
		index('notifications_member_read_created_idx').on(t.member_id, t.read_at, t.created_at),
		index('notifications_member_type_resource_idx').on(t.member_id, t.type, t.resource_id),
		uniqueIndex('notifications_unread_batch_uq')
			.on(t.member_id, t.type, t.resource_id)
			.where(sql`${t.read_at} IS NULL AND ${t.resource_id} IS NOT NULL`)
	]
);

export type Notification = InferSelectModel<typeof notifications>;
export type NewNotification = InferInsertModel<typeof notifications>;

// Per-member, per-type notification preferences — absence of row = defaults
export const memberNotificationPreferences = pgTable(
	'member_notification_preferences',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		org_id: uuid('org_id')
			.notNull()
			.references(() => organizations.id),
		member_id: uuid('member_id')
			.notNull()
			.references(() => orgMembers.id),
		notification_type: text('notification_type').notNull(),
		in_app_enabled: boolean('in_app_enabled').notNull().default(true),
		push_enabled: boolean('push_enabled').notNull().default(true),
		// Email/SMS default OFF — email needs opt-in, SMS costs real money (Stage 1.b).
		// In-app/push stay default ON. The resolver intersects these with the admin
		// ceiling on org_members and the member's status profile.
		email_enabled: boolean('email_enabled').notNull().default(false),
		sms_enabled: boolean('sms_enabled').notNull().default(false),
		created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [uniqueIndex('member_notif_pref_unique').on(t.member_id, t.notification_type)]
);

export type MemberNotificationPreference = InferSelectModel<typeof memberNotificationPreferences>;
export type NewMemberNotificationPreference = InferInsertModel<
	typeof memberNotificationPreferences
>;

// Web Push subscriptions — one row per device per member
export const pushSubscriptions = pgTable(
	'push_subscriptions',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		org_id: uuid('org_id').notNull(),
		member_id: uuid('member_id')
			.notNull()
			.references(() => orgMembers.id),
		endpoint: text('endpoint').notNull().unique(),
		p256dh: text('p256dh').notNull(),
		auth: text('auth').notNull(),
		user_agent: text('user_agent'),
		created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		last_seen_at: timestamp('last_seen_at', { withTimezone: true })
	},
	(t) => [index('push_subscriptions_member_idx').on(t.member_id)]
);

export type PushSubscription = InferSelectModel<typeof pushSubscriptions>;
export type NewPushSubscription = InferInsertModel<typeof pushSubscriptions>;

// Push throttle state — prevents spamming push for batchable event types
export const notificationDeliveryState = pgTable(
	'notification_delivery_state',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		member_id: uuid('member_id')
			.notNull()
			.references(() => orgMembers.id),
		notification_type: text('notification_type').notNull(),
		resource_id: uuid('resource_id').notNull(),
		last_push_sent_at: timestamp('last_push_sent_at', { withTimezone: true }).notNull()
	},
	(t) => [
		uniqueIndex('notif_delivery_state_unique').on(t.member_id, t.notification_type, t.resource_id),
		index('notif_delivery_state_last_push_idx').on(t.last_push_sent_at)
	]
);

export type NotificationDeliveryState = InferSelectModel<typeof notificationDeliveryState>;
export type NewNotificationDeliveryState = InferInsertModel<typeof notificationDeliveryState>;

export const automationJobs = pgTable('automation_jobs', {
	id: uuid('id').primaryKey().defaultRandom(),
	org_id: uuid('org_id')
		.notNull()
		.references(() => organizations.id),
	type: automationJobTypeEnum('type').notNull(),
	resource_type: text('resource_type').notNull(),
	resource_id: uuid('resource_id').notNull(),
	bull_job_id: text('bull_job_id').notNull(),
	status: automationJobStatusEnum('status').notNull().default('pending'),
	attempts: integer('attempts').notNull().default(0),
	last_error: text('last_error'),
	scheduled_for: timestamp('scheduled_for', { withTimezone: true }),
	started_at: timestamp('started_at', { withTimezone: true }),
	completed_at: timestamp('completed_at', { withTimezone: true }),
	failed_at: timestamp('failed_at', { withTimezone: true }),
	created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

export type AutomationJob = InferSelectModel<typeof automationJobs>;
export type NewAutomationJob = InferInsertModel<typeof automationJobs>;

export const outboxEvents = pgTable('outbox_events', {
	id: uuid('id').primaryKey().defaultRandom(),
	org_id: uuid('org_id').references(() => organizations.id),
	event_type: text('event_type').notNull(),
	event_version: integer('event_version').notNull().default(1),
	resource_type: text('resource_type').notNull(),
	resource_id: uuid('resource_id').notNull(),
	payload: jsonb('payload').notNull(),
	status: outboxEventStatusEnum('status').notNull().default('pending'),
	attempts: integer('attempts').notNull().default(0),
	max_attempts: integer('max_attempts').notNull().default(3),
	sequence: serial('sequence'),
	available_at: timestamp('available_at', { withTimezone: true }).notNull().defaultNow(),
	processed_at: timestamp('processed_at', { withTimezone: true }),
	dead_lettered_at: timestamp('dead_lettered_at', { withTimezone: true }),
	last_error: text('last_error'),
	idempotency_key: text('idempotency_key').notNull().unique(),
	created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

export type OutboxEvent = InferSelectModel<typeof outboxEvents>;
export type NewOutboxEvent = InferInsertModel<typeof outboxEvents>;

export const orgCounters = pgTable('org_counters', {
	org_id: uuid('org_id')
		.primaryKey()
		.references(() => organizations.id),
	next_quote_number: integer('next_quote_number').notNull().default(1),
	next_invoice_number: integer('next_invoice_number').notNull().default(1),
	created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

export type OrgCounter = InferSelectModel<typeof orgCounters>;
export type NewOrgCounter = InferInsertModel<typeof orgCounters>;

// Platform-wide singleton (PO scope — no org_id). Exactly one row, id='global',
// enforced by the CHECK constraint. Home for the SMS master-balance safety floor
// (Blueprint §"PO Safety Floor"): the PO's real Telnyx master-account balance is
// cached here on a timer, and the floor is the threshold below which all SMS is
// paused platform-wide. The authoritative paused state is BullMQ's own queue
// pause flag (smsQueue().isPaused()), NOT a column here — sms_paused_at/reason
// are display/audit metadata recorded when a pause is triggered.
export const platformSettings = pgTable(
	'platform_settings',
	{
		id: text('id').primaryKey().default('global'),
		// SMS master-balance safety floor, in the master account's currency (USD).
		// 0 disables the floor (no automatic pause). PO-configured via /jafar.
		sms_master_floor: numeric('sms_master_floor', { precision: 12, scale: 4 })
			.notNull()
			.default('0'),
		// Last-fetched Telnyx master-account available credit (cached by the
		// sms-master-balance-sync cron). Null until the first successful fetch.
		sms_master_balance: numeric('sms_master_balance', { precision: 12, scale: 4 }),
		sms_master_balance_at: timestamp('sms_master_balance_at', { withTimezone: true }),
		sms_master_balance_currency: text('sms_master_balance_currency'),
		// Set when SMS is paused (auto by the floor, or manually by the PO). Cleared
		// on resume. Authoritative paused state lives in BullMQ; these explain WHY.
		sms_paused_at: timestamp('sms_paused_at', { withTimezone: true }),
		sms_paused_reason: text('sms_paused_reason'),
		// ── Platform system email sending domain (PO-managed in /jafar) ──────────
		// Outbound-only mirror of the per-org email_domains flow: the platform's own
		// system/PO mail (carrier notifications, password resets, billing) sends from
		// a dedicated Brevo-authenticated subdomain registered + verified here. Being
		// a singleton, these live on platform_settings rather than a per-row table.
		// systemFromAddress() reads system_email_domain when status='verified',
		// otherwise falls back to the SYSTEM_FROM_EMAIL env value.
		// Source-of-truth inputs the PO types; system_email_domain is derived as
		// `${sending_prefix}.${root_domain}` (e.g. notifications.upliftcontractor.com).
		system_email_root_domain: text('system_email_root_domain'),
		system_email_sending_prefix: text('system_email_sending_prefix'),
		system_email_domain: text('system_email_domain'),
		// From identity: `"${from_name}" <${from_local}@${domain}>`.
		system_email_from_local: text('system_email_from_local').notNull().default('noreply'),
		system_email_from_name: text('system_email_from_name').notNull().default('Uplift Contractor'),
		system_email_brevo_domain_id: text('system_email_brevo_domain_id'),
		// Null until the PO registers a domain. Reuses the per-org email_domain_status enum.
		system_email_status: emailDomainStatusEnum('system_email_status'),
		system_email_brevo_verified: boolean('system_email_brevo_verified').notNull().default(false),
		system_email_brevo_authenticated: boolean('system_email_brevo_authenticated')
			.notNull()
			.default(false),
		// DKIM + brevo-code + DMARC rows (sending-only; no inbound MX) for the panel.
		system_email_dns_records: jsonb('system_email_dns_records').$type<EmailDnsRecord[]>(),
		system_email_last_checked_at: timestamp('system_email_last_checked_at', {
			withTimezone: true
		}),
		system_email_verified_at: timestamp('system_email_verified_at', { withTimezone: true }),
		created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [check('platform_settings_singleton', sql`${t.id} = 'global'`)]
);

export type PlatformSettings = InferSelectModel<typeof platformSettings>;
export type NewPlatformSettings = InferInsertModel<typeof platformSettings>;
