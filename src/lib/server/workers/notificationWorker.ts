import { Worker, type Job } from 'bullmq';
import { and, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import {
	automationSettings,
	contacts,
	conversations,
	invoices,
	notifications,
	orgMembers,
	organizations,
	payments,
	type NewNotification
} from '$lib/server/db/schema';
import { NOTIFICATION_QUEUE, redisConnection } from '$lib/server/queue/bullmq';
import { automationCancelHooks } from './automationWorker';
import { queueAutomationEmail } from '$lib/server/conversations/queueAutomationEmail';
import { interpolate } from './templates';
const env = process.env;

type EventJobData = {
	outbox_event_id: string;
	event_type: string;
	org_id: string | null;
	resource_type: string;
	resource_id: string;
	payload: Record<string, unknown>;
};

const ADMIN_MANAGER_ROLES = ['admin', 'manager'] as const;

async function adminManagerMembers(orgId: string) {
	return db
		.select({ id: orgMembers.id })
		.from(orgMembers)
		.where(
			and(
				eq(orgMembers.org_id, orgId),
				eq(orgMembers.is_active, true),
				isNull(orgMembers.deleted_at),
				inArray(orgMembers.role, [...ADMIN_MANAGER_ROLES])
			)
		);
}

async function membersWithPermission(orgId: string, column: 'can_view_reviews' | 'can_view_negative_feedback') {
	return db
		.select({ id: orgMembers.id })
		.from(orgMembers)
		.where(
			and(
				eq(orgMembers.org_id, orgId),
				eq(orgMembers.is_active, true),
				isNull(orgMembers.deleted_at),
				eq(orgMembers[column], true)
			)
		);
}

async function messageRecipients(orgId: string, conversationId: string) {
	const [conv] = await db
		.select({ assigned_to: conversations.assigned_to })
		.from(conversations)
		.where(eq(conversations.id, conversationId));
	if (conv?.assigned_to) {
		return [{ id: conv.assigned_to }];
	}
	return db
		.select({ id: orgMembers.id })
		.from(orgMembers)
		.where(
			and(
				eq(orgMembers.org_id, orgId),
				eq(orgMembers.is_active, true),
				isNull(orgMembers.deleted_at),
				eq(orgMembers.role, 'admin')
			)
		);
}

type NotificationSpec = {
	type: string;
	title: string;
	body?: string | null;
	resource_type: string;
	resource_id: string;
	// idempotency: deterministic key string OR null for repeatable events
	idempotent: boolean;
};

async function dispatchNotification(
	orgId: string,
	recipients: { id: string }[],
	spec: NotificationSpec,
	eventType: string
): Promise<void> {
	if (recipients.length === 0) return;
	const rows: NewNotification[] = recipients.map((m) => ({
		org_id: orgId,
		member_id: m.id,
		type: spec.type,
		title: spec.title,
		body: spec.body ?? null,
		resource_type: spec.resource_type,
		resource_id: spec.resource_id,
		idempotency_key: spec.idempotent ? `${eventType}:${spec.resource_id}:${m.id}` : null
	}));
	if (spec.idempotent) {
		await db.insert(notifications).values(rows).onConflictDoNothing({
			target: notifications.idempotency_key,
			targetWhere: sql`idempotency_key IS NOT NULL`
		});
	} else {
		await db.insert(notifications).values(rows);
	}
}

async function handleOpportunityWon(data: EventJobData) {
	if (!data.org_id) return;
	const recipients = await adminManagerMembers(data.org_id);
	await dispatchNotification(
		data.org_id,
		recipients,
		{
			type: 'opportunity.won',
			title: 'Opportunity won',
			body: (data.payload.title as string | undefined) ?? null,
			resource_type: 'opportunity',
			resource_id: data.resource_id,
			idempotent: true
		},
		'opportunity.won'
	);
}

async function handleJobCreated(data: EventJobData) {
	if (!data.org_id) return;
	const recipients = await adminManagerMembers(data.org_id);
	await dispatchNotification(
		data.org_id,
		recipients,
		{
			type: 'job.created',
			title: 'New job created',
			body: (data.payload.title as string | undefined) ?? null,
			resource_type: 'job',
			resource_id: data.resource_id,
			idempotent: false
		},
		'job.created'
	);
}

async function handleInvoicePaid(data: EventJobData) {
	if (!data.org_id) return;
	const recipients = await adminManagerMembers(data.org_id);
	await dispatchNotification(
		data.org_id,
		recipients,
		{
			type: 'invoice.paid',
			title: 'Invoice paid',
			body: (data.payload.summary as string | undefined) ?? null,
			resource_type: 'invoice',
			resource_id: data.resource_id,
			idempotent: true
		},
		'invoice.paid'
	);
	await automationCancelHooks.invoicePaid(data);
}

async function handleQuoteViewed(data: EventJobData) {
	if (!data.org_id) return;
	const recipients = await adminManagerMembers(data.org_id);
	await dispatchNotification(
		data.org_id,
		recipients,
		{
			type: 'quote.viewed',
			title: 'Quote viewed',
			body: (data.payload.summary as string | undefined) ?? null,
			resource_type: 'quote',
			resource_id: data.resource_id,
			idempotent: false
		},
		'quote.viewed'
	);
	await automationCancelHooks.quoteViewed(data);
}

async function handleQuoteDeclined(data: EventJobData) {
	if (!data.org_id) return;
	const recipients = await adminManagerMembers(data.org_id);
	await dispatchNotification(
		data.org_id,
		recipients,
		{
			type: 'quote.declined',
			title: 'Quote declined',
			body: (data.payload.summary as string | undefined) ?? null,
			resource_type: 'quote',
			resource_id: data.resource_id,
			idempotent: true
		},
		'quote.declined'
	);
	await automationCancelHooks.quoteDeclined(data);
}

async function handleQuoteChangesRequested(data: EventJobData) {
	if (!data.org_id) return;
	const recipients = await adminManagerMembers(data.org_id);
	await dispatchNotification(
		data.org_id,
		recipients,
		{
			type: 'quote.changes_requested',
			title: 'Client requested changes',
			body: (data.payload.summary as string | undefined) ?? null,
			resource_type: 'quote',
			resource_id: data.resource_id,
			idempotent: true
		},
		'quote.changes_requested'
	);
	await automationCancelHooks.quoteChangesRequested(data);
}

async function handleQuoteDepositPaid(data: EventJobData) {
	if (!data.org_id) return;
	const recipients = await adminManagerMembers(data.org_id);
	await dispatchNotification(
		data.org_id,
		recipients,
		{
			type: 'quote.deposit_paid',
			title: 'Deposit received',
			body: (data.payload.summary as string | undefined) ?? null,
			resource_type: 'quote',
			resource_id: data.resource_id,
			idempotent: true
		},
		'quote.deposit_paid'
	);
}

async function handleQuoteAccepted(data: EventJobData) {
	if (!data.org_id) return;
	const recipients = await adminManagerMembers(data.org_id);
	await dispatchNotification(
		data.org_id,
		recipients,
		{
			type: 'quote.accepted',
			title: 'Quote accepted',
			body: (data.payload.summary as string | undefined) ?? null,
			resource_type: 'quote',
			resource_id: data.resource_id,
			idempotent: true
		},
		'quote.accepted'
	);
	await automationCancelHooks.quoteAccepted(data);
}

async function handleMessageReceived(data: EventJobData) {
	if (!data.org_id) return;
	const conversationId = (data.payload.conversation_id as string | undefined) ?? data.resource_id;
	const recipients = await messageRecipients(data.org_id, conversationId);
	await dispatchNotification(
		data.org_id,
		recipients,
		{
			type: 'message.received',
			title: 'New message',
			body: (data.payload.preview as string | undefined) ?? null,
			resource_type: 'conversation',
			resource_id: conversationId,
			idempotent: false
		},
		'message.received'
	);
}

async function handleReviewReceived(data: EventJobData) {
	if (!data.org_id) return;
	const recipients = await membersWithPermission(data.org_id, 'can_view_reviews');
	await dispatchNotification(
		data.org_id,
		recipients,
		{
			type: 'review.received',
			title: 'New review received',
			body: (data.payload.summary as string | undefined) ?? null,
			resource_type: 'review',
			resource_id: data.resource_id,
			idempotent: false
		},
		'review.received'
	);
}

async function handlePrivateFeedback(data: EventJobData) {
	if (!data.org_id) return;
	const recipients = await membersWithPermission(data.org_id, 'can_view_negative_feedback');
	await dispatchNotification(
		data.org_id,
		recipients,
		{
			type: 'private_feedback.received',
			title: 'Negative feedback received',
			body: (data.payload.summary as string | undefined) ?? null,
			resource_type: 'private_feedback',
			resource_id: data.resource_id,
			idempotent: false
		},
		'private_feedback.received'
	);
}

async function handleCallMissed(data: EventJobData) {
	if (!data.org_id) return;
	const recipients = await adminManagerMembers(data.org_id);
	await dispatchNotification(
		data.org_id,
		recipients,
		{
			type: 'call.missed',
			title: 'Missed call',
			body: (data.payload.from as string | undefined) ?? null,
			resource_type: 'conversation',
			resource_id: (data.payload.conversation_id as string | undefined) ?? data.resource_id,
			idempotent: false
		},
		'call.missed'
	);
}

async function handleMessageDeliveryFailed(data: EventJobData) {
	if (!data.org_id) return;
	const payload = data.payload as {
		message_id?: string;
		conversation_id?: string;
		channel?: 'sms' | 'email' | 'webchat' | 'missed_call';
		status?: 'failed' | 'bounced' | 'undeliverable';
		is_terminal?: boolean;
		failure_reason?: string | null;
		sent_by?: string | null;
	};

	const channel = payload.channel ?? 'sms';
	const status = payload.status ?? 'failed';
	const conversationId = payload.conversation_id ?? data.resource_id;

	let recipients: { id: string }[] = [];
	if (payload.sent_by) {
		const [sender] = await db
			.select({ id: orgMembers.id })
			.from(orgMembers)
			.where(
				and(
					eq(orgMembers.id, payload.sent_by),
					eq(orgMembers.org_id, data.org_id),
					eq(orgMembers.is_active, true),
					isNull(orgMembers.deleted_at)
				)
			)
			.limit(1);
		if (sender) recipients = [sender];
	}
	if (recipients.length === 0) {
		recipients = await adminManagerMembers(data.org_id);
	}

	const title =
		channel === 'email'
			? status === 'bounced'
				? 'Email bounced'
				: status === 'undeliverable'
					? 'Email undeliverable'
					: 'Email failed to send'
			: status === 'undeliverable'
				? 'SMS undeliverable'
				: 'SMS failed to send';

	await dispatchNotification(
		data.org_id,
		recipients,
		{
			type: 'message.delivery_failed',
			title,
			body: payload.failure_reason ?? null,
			resource_type: 'conversation',
			resource_id: conversationId,
			// Idempotent per outbox event: retries emit a new event (new outbox id)
			// and therefore a new notification — exactly what we want.
			idempotent: true
		},
		`message.delivery_failed:${data.outbox_event_id}`
	);
}

async function handleContactSmsOptedIn(data: EventJobData) {
	if (!data.org_id) return;
	const recipients = await adminManagerMembers(data.org_id);
	await dispatchNotification(
		data.org_id,
		recipients,
		{
			type: 'contact.sms_opted_in',
			title: 'Contact opted in to SMS',
			body: (data.payload.contact_name as string | undefined) ?? null,
			resource_type: 'contact',
			resource_id: data.resource_id,
			idempotent: false
		},
		'contact.sms_opted_in'
	);
}

async function handleInvoiceViewed(data: EventJobData) {
	if (!data.org_id) return;
	const recipients = await adminManagerMembers(data.org_id);
	await dispatchNotification(
		data.org_id,
		recipients,
		{
			type: 'invoice.viewed',
			title: 'Invoice viewed',
			body: (data.payload.summary as string | undefined) ?? null,
			resource_type: 'invoice',
			resource_id: data.resource_id,
			// Use idempotency_key so duplicate view events never spam the notification feed.
			idempotent: true
		},
		'invoice.viewed'
	);
}

async function handlePaymentRecorded(data: EventJobData) {
	if (!data.org_id) return;

	// 1. Contractor notification.
	const recipients = await adminManagerMembers(data.org_id);
	await dispatchNotification(
		data.org_id,
		recipients,
		{
			type: 'payment.recorded',
			title: 'Payment received',
			body: (data.payload.amount_formatted as string | undefined) ?? null,
			resource_type: 'invoice',
			resource_id: data.resource_id,
			idempotent: false
		},
		'payment.recorded'
	);

	// 2. Transactional receipt email to customer — respects payment_receipt_enabled.
	const paymentId = data.payload.payment_id as string | undefined;
	if (!paymentId) return;

	const [settings] = await db
		.select()
		.from(automationSettings)
		.where(eq(automationSettings.org_id, data.org_id));
	if (!settings?.payment_receipt_enabled) return;

	const [invoiceRow] = await db
		.select({
			id: invoices.id,
			contact_id: invoices.contact_id,
			total: invoices.total
		})
		.from(invoices)
		.where(eq(invoices.id, data.resource_id))
		.limit(1);
	if (!invoiceRow) return;

	const [contact] = await db
		.select({ id: contacts.id, full_name: contacts.full_name, email: contacts.email })
		.from(contacts)
		.where(eq(contacts.id, invoiceRow.contact_id))
		.limit(1);
	if (!contact?.email) return;

	const [org] = await db
		.select({ name: organizations.name })
		.from(organizations)
		.where(eq(organizations.id, data.org_id))
		.limit(1);
	if (!org) return;

	const [payment] = await db
		.select({ amount: payments.amount })
		.from(payments)
		.where(eq(payments.id, paymentId))
		.limit(1);
	if (!payment) return;

	const amountFormatted = data.payload.amount_formatted as string ?? `$${Number(payment.amount).toFixed(2)}`;
	const body = interpolate(settings.payment_receipt_message, {
		contact_name: contact.full_name,
		org_name: org.name,
		amount: amountFormatted
	});

	try {
		await queueAutomationEmail(db, {
			orgId: data.org_id,
			contactId: contact.id,
			contactEmail: contact.email,
			subject: `Payment receipt from ${org.name}`,
			body,
			source: 'automation.payment_receipt'
		});

		// Mark receipt as sent on the payment row.
		await db
			.update(payments)
			.set({ receipt_sent_at: new Date(), receipt_sent_via: 'email' })
			.where(eq(payments.id, paymentId));
	} catch (err) {
		console.error('[notification] payment receipt email failed:', err);
	}
}

export const notificationWorker = new Worker<EventJobData>(
	NOTIFICATION_QUEUE,
	async (job: Job<EventJobData>) => {
		const data = job.data;
		switch (job.name) {
			case 'opportunity.won':
				return handleOpportunityWon(data);
			case 'job.created':
				return handleJobCreated(data);
			case 'invoice.paid':
				return handleInvoicePaid(data);
			case 'quote.viewed':
				return handleQuoteViewed(data);
			case 'quote.accepted':
				return handleQuoteAccepted(data);
			case 'quote.deposit_paid':
				return handleQuoteDepositPaid(data);
			case 'quote.declined':
				return handleQuoteDeclined(data);
			case 'quote.changes_requested':
				return handleQuoteChangesRequested(data);
			case 'message.received':
				return handleMessageReceived(data);
			case 'message.delivery_failed':
				return handleMessageDeliveryFailed(data);
			case 'review.received':
				return handleReviewReceived(data);
			case 'private_feedback.received':
			case 'negative_feedback':
				return handlePrivateFeedback(data);
			case 'call.missed':
			case 'missed_call':
				return handleCallMissed(data);
			case 'contact.sms_opted_in':
				return handleContactSmsOptedIn(data);
			case 'invoice.viewed':
				return handleInvoiceViewed(data);
			case 'payment.recorded':
				return handlePaymentRecorded(data);
			default:
				console.warn(`[notification] unknown job name: ${job.name}`);
		}
	},
	{ connection: redisConnection(), concurrency: Number(env.NOTIFICATION_WORKER_CONCURRENCY ?? '5') }
);

notificationWorker.on('failed', (job, err) => {
	console.error(`[notification] job ${job?.id} (${job?.name}) failed:`, err.message);
});
