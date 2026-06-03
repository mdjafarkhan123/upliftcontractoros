import { Worker, type Job } from 'bullmq';
import { and, eq, gt, inArray, isNull, sql } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import {
	automationSettings,
	contacts,
	conversations,
	invoices,
	memberNotificationPreferences,
	notifications,
	notificationDeliveryState,
	orgMembers,
	organizations,
	payments,
	pushSubscriptions,
	type NewNotification
} from '$lib/server/db/schema';
import { NOTIFICATION_QUEUE, redisConnection } from '$lib/server/queue/bullmq';
import { automationCancelHooks } from './automationWorker';
import { loadAssigneeMemberIds } from '$lib/server/appointments/assignees';
import { queueAutomationEmail } from '$lib/server/conversations/queueAutomationEmail';
import { queueAutomationSms } from '$lib/server/conversations/queueAutomationSms';
import { interpolate } from './templates';
import { NOTIFICATION_SPEC } from '$lib/notifications/spec';
import { preferenceFor } from '$lib/server/notifications/preferences';
import { sendPush } from '$lib/server/push/index';
import type { NotificationType, PushPayload } from '$lib/notifications/types';

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

async function membersWithPermission(
	orgId: string,
	column: 'can_view_reviews' | 'can_view_negative_feedback'
) {
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

type DispatchOptions = {
	orgId: string;
	memberId: string;
	type: NotificationType;
	title: string;
	body?: string | null;
	resourceType: string;
	resourceId: string;
	route: string;
	metadata?: Record<string, unknown>;
	idempotencyKey?: string | null;
};

async function dispatchToMember(opts: DispatchOptions): Promise<void> {
	const spec = NOTIFICATION_SPEC[opts.type];
	if (!spec) return;

	const pref = await preferenceFor(opts.memberId, opts.type);
	if (!pref.in_app_enabled && !pref.push_enabled) return;

	let notificationId: string | null = null;

	if (pref.in_app_enabled) {
		if (spec.batchable) {
			// Race-safe upsert backed by the partial unique index
			// notifications_unread_batch_uq (member_id, type, resource_id) WHERE read_at IS NULL.
			// On collision we increment count and refresh title/metadata/last_event_at.
			const [row] = await db
				.insert(notifications)
				.values({
					org_id: opts.orgId,
					member_id: opts.memberId,
					type: opts.type,
					title: opts.title,
					body: opts.body ?? null,
					resource_type: opts.resourceType,
					resource_id: opts.resourceId,
					route: opts.route,
					priority: spec.priority,
					metadata: opts.metadata ?? {},
					idempotency_key: opts.idempotencyKey ?? null
				})
				.onConflictDoUpdate({
					target: [notifications.member_id, notifications.type, notifications.resource_id],
					targetWhere: sql`${notifications.read_at} IS NULL AND ${notifications.resource_id} IS NOT NULL`,
					set: {
						aggregation_count: sql`${notifications.aggregation_count} + 1`,
						last_event_at: new Date(),
						title: opts.title,
						metadata: opts.metadata ?? {}
					}
				})
				.returning({ id: notifications.id });
			notificationId = row?.id ?? null;
		} else {
			if (opts.idempotencyKey) {
				const [inserted] = await db
					.insert(notifications)
					.values({
						org_id: opts.orgId,
						member_id: opts.memberId,
						type: opts.type,
						title: opts.title,
						body: opts.body ?? null,
						resource_type: opts.resourceType,
						resource_id: opts.resourceId,
						route: opts.route,
						priority: spec.priority,
						metadata: opts.metadata ?? {},
						idempotency_key: opts.idempotencyKey
					})
					.onConflictDoNothing({ target: notifications.idempotency_key })
					.returning({ id: notifications.id });
				notificationId = inserted?.id ?? null;
			} else {
				const [inserted] = await db
					.insert(notifications)
					.values({
						org_id: opts.orgId,
						member_id: opts.memberId,
						type: opts.type,
						title: opts.title,
						body: opts.body ?? null,
						resource_type: opts.resourceType,
						resource_id: opts.resourceId,
						route: opts.route,
						priority: spec.priority,
						metadata: opts.metadata ?? {}
					})
					.returning({ id: notifications.id });
				notificationId = inserted?.id ?? null;
			}
		}
	}

	if (!pref.push_enabled || !notificationId) return;

	// Check if already pushed (idempotency guard for retried workers)
	const [existingRow] = await db
		.select({ push_sent_at: notifications.push_sent_at })
		.from(notifications)
		.where(eq(notifications.id, notificationId))
		.limit(1);
	if (existingRow?.push_sent_at) return;

	// Throttle check for spam-prone types
	if (spec.throttleMinutes) {
		const cutoff = new Date(Date.now() - spec.throttleMinutes * 60 * 1000);
		const [throttleRow] = await db
			.select({ last_push_sent_at: notificationDeliveryState.last_push_sent_at })
			.from(notificationDeliveryState)
			.where(
				and(
					eq(notificationDeliveryState.member_id, opts.memberId),
					eq(notificationDeliveryState.notification_type, opts.type),
					eq(notificationDeliveryState.resource_id, opts.resourceId),
					gt(notificationDeliveryState.last_push_sent_at, cutoff)
				)
			)
			.limit(1);
		if (throttleRow) return;

		// Upsert throttle state before dispatch
		await db
			.insert(notificationDeliveryState)
			.values({
				member_id: opts.memberId,
				notification_type: opts.type,
				resource_id: opts.resourceId,
				last_push_sent_at: new Date()
			})
			.onConflictDoUpdate({
				target: [
					notificationDeliveryState.member_id,
					notificationDeliveryState.notification_type,
					notificationDeliveryState.resource_id
				],
				set: { last_push_sent_at: new Date() }
			});
	}

	// Load push subscriptions for this member
	const subs = await db
		.select({
			id: pushSubscriptions.id,
			endpoint: pushSubscriptions.endpoint,
			p256dh: pushSubscriptions.p256dh,
			auth: pushSubscriptions.auth
		})
		.from(pushSubscriptions)
		.where(eq(pushSubscriptions.member_id, opts.memberId));

	if (subs.length === 0) return;

	const pushPayload: PushPayload = {
		v: 1,
		notification_id: notificationId,
		type: opts.type,
		priority: spec.priority,
		route: opts.route,
		resource_id: opts.resourceId,
		title: opts.title,
		body: opts.body ?? '',
		require_interaction: spec.requireInteraction,
		metadata: opts.metadata ?? {}
	};

	const expiredIds: string[] = [];
	let anySuccess = false;

	for (const sub of subs) {
		const result = await sendPush(sub.endpoint, sub.p256dh, sub.auth, pushPayload);
		if ('ok' in result) {
			anySuccess = true;
		} else if ('expired' in result) {
			expiredIds.push(sub.id);
		}
	}

	// Inline cleanup of stale subscriptions
	if (expiredIds.length > 0) {
		await db.delete(pushSubscriptions).where(inArray(pushSubscriptions.id, expiredIds));
	}

	// Mark push as sent
	if (anySuccess) {
		await db
			.update(notifications)
			.set({ push_sent_at: new Date() })
			.where(eq(notifications.id, notificationId));
	}
}

type LegacyNotificationSpec = {
	type: NewNotification['type'];
	title: string;
	body?: string | null;
	resource_type: string;
	resource_id: string;
	idempotent: boolean;
};

// Legacy path for event types not yet migrated to NOTIFICATION_SPEC
async function dispatchNotification(
	orgId: string,
	recipients: { id: string }[],
	spec: LegacyNotificationSpec,
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
		await db
			.insert(notifications)
			.values(rows)
			.onConflictDoNothing({
				target: notifications.idempotency_key,
				where: sql`idempotency_key IS NOT NULL`
			});
	} else {
		await db.insert(notifications).values(rows);
	}
}

async function pipelineRecipients(orgId: string, assignedTo: unknown): Promise<{ id: string }[]> {
	if (typeof assignedTo === 'string' && assignedTo.length > 0) {
		return [{ id: assignedTo }];
	}
	return adminManagerMembers(orgId);
}

async function handleOpportunityCreated(data: EventJobData) {
	if (!data.org_id) return;
	const recipients = await pipelineRecipients(data.org_id, data.payload.assigned_to);
	const title = (data.payload.title as string | undefined) ?? '';
	await dispatchNotification(
		data.org_id,
		recipients,
		{
			type: 'opportunity.created',
			title: 'New opportunity',
			body: title || null,
			resource_type: 'opportunity',
			resource_id: data.resource_id,
			idempotent: true
		},
		'opportunity.created'
	);
}

async function handleOpportunityAssigneeChanged(data: EventJobData) {
	if (!data.org_id) return;
	const newAssignee = data.payload.new_assigned_to;
	if (typeof newAssignee !== 'string' || newAssignee.length === 0) return;
	const changedBy = data.payload.changed_by_member_id;
	if (changedBy === newAssignee) return; // self-assignment is silent
	const title = (data.payload.title as string | undefined) ?? '';
	await dispatchNotification(
		data.org_id,
		[{ id: newAssignee }],
		{
			type: 'opportunity.assignee_changed',
			title: 'Opportunity assigned to you',
			body: title || null,
			resource_type: 'opportunity',
			resource_id: data.resource_id,
			idempotent: true
		},
		`opportunity.assignee_changed:${newAssignee}`
	);
}

async function handleOpportunityLost(data: EventJobData) {
	if (!data.org_id) return;
	const recipients = await pipelineRecipients(data.org_id, data.payload.assigned_to);
	const reason =
		typeof data.payload.lost_reason === 'string' && data.payload.lost_reason.trim()
			? (data.payload.lost_reason as string)
			: null;
	await dispatchNotification(
		data.org_id,
		recipients,
		{
			type: 'opportunity.lost',
			title: 'Opportunity lost',
			body: reason,
			resource_type: 'opportunity',
			resource_id: data.resource_id,
			idempotent: true
		},
		'opportunity.lost'
	);
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
	const customerName = (data.payload.customer_name as string | undefined) ?? '';
	const quoteNumber = (data.payload.quote_number as string | undefined) ?? '';
	const amountFormatted = (data.payload.amount_formatted as string | undefined) ?? '';

	const titleParts: string[] = [];
	if (customerName) titleParts.push(customerName);
	titleParts.push('just opened your');
	if (amountFormatted) titleParts.push(`${amountFormatted} quote`);
	else if (quoteNumber) titleParts.push(`quote ${quoteNumber}`);
	else titleParts.push('quote');
	const title = titleParts.join(' ');

	for (const r of recipients) {
		await dispatchToMember({
			orgId: data.org_id,
			memberId: r.id,
			type: 'quote_viewed',
			title,
			body: 'Tap to view and follow up',
			resourceType: 'quote',
			resourceId: data.resource_id,
			route: NOTIFICATION_SPEC.quote_viewed.route(data.resource_id),
			metadata: {
				customer_name: customerName,
				quote_number: quoteNumber,
				amount_formatted: amountFormatted
			}
		});
	}
	await automationCancelHooks.quoteViewed(data);
}

async function handleQuoteDeclined(data: EventJobData) {
	if (!data.org_id) return;
	const recipients = await adminManagerMembers(data.org_id);
	const customerName = (data.payload.customer_name as string | undefined) ?? '';
	const title = customerName ? `${customerName} declined your quote` : 'Quote declined';
	for (const r of recipients) {
		await dispatchToMember({
			orgId: data.org_id,
			memberId: r.id,
			type: 'quote_declined',
			title,
			body: (data.payload.summary as string | undefined) ?? null,
			resourceType: 'quote',
			resourceId: data.resource_id,
			route: NOTIFICATION_SPEC.quote_declined.route(data.resource_id),
			metadata: { customer_name: customerName },
			idempotencyKey: `quote.declined:${data.resource_id}:${r.id}`
		});
	}
	await automationCancelHooks.quoteDeclined(data);
}

async function handleQuoteChangesRequested(data: EventJobData) {
	if (!data.org_id) return;
	const recipients = await adminManagerMembers(data.org_id);
	const customerName = (data.payload.customer_name as string | undefined) ?? '';
	const title = customerName ? `${customerName} requested changes` : 'Client requested changes';
	for (const r of recipients) {
		await dispatchToMember({
			orgId: data.org_id,
			memberId: r.id,
			type: 'quote_changes_requested',
			title,
			body: (data.payload.summary as string | undefined) ?? null,
			resourceType: 'quote',
			resourceId: data.resource_id,
			route: NOTIFICATION_SPEC.quote_changes_requested.route(data.resource_id),
			metadata: { customer_name: customerName },
			idempotencyKey: `quote.changes_requested:${data.resource_id}:${r.id}`
		});
	}
	await automationCancelHooks.quoteChangesRequested(data);
}

async function handleQuoteDepositPaid(data: EventJobData) {
	if (!data.org_id) return;
	const recipients = await adminManagerMembers(data.org_id);
	const customerName = (data.payload.customer_name as string | undefined) ?? '';
	const amountFormatted = (data.payload.amount_formatted as string | undefined) ?? '';
	const title =
		[customerName, 'paid a deposit', amountFormatted ? `of ${amountFormatted}` : '']
			.filter(Boolean)
			.join(' ') || 'Deposit received';
	for (const r of recipients) {
		await dispatchToMember({
			orgId: data.org_id,
			memberId: r.id,
			type: 'quote_deposit_paid',
			title,
			body: (data.payload.summary as string | undefined) ?? null,
			resourceType: 'quote',
			resourceId: data.resource_id,
			route: NOTIFICATION_SPEC.quote_deposit_paid.route(data.resource_id),
			metadata: { customer_name: customerName, amount_formatted: amountFormatted },
			idempotencyKey: `quote.deposit_paid:${data.resource_id}:${r.id}`
		});
	}
}

async function handleQuoteAccepted(data: EventJobData) {
	if (!data.org_id) return;
	const recipients = await adminManagerMembers(data.org_id);
	const customerName = (data.payload.customer_name as string | undefined) ?? '';
	const amountFormatted = (data.payload.amount_formatted as string | undefined) ?? '';
	const title = customerName
		? `${customerName} accepted your quote${amountFormatted ? ` — ${amountFormatted}` : ''}`
		: 'Quote accepted';
	for (const r of recipients) {
		await dispatchToMember({
			orgId: data.org_id,
			memberId: r.id,
			type: 'quote_accepted',
			title,
			body: 'They said yes',
			resourceType: 'quote',
			resourceId: data.resource_id,
			route: NOTIFICATION_SPEC.quote_accepted.route(data.resource_id),
			metadata: { customer_name: customerName, amount_formatted: amountFormatted },
			idempotencyKey: `quote.accepted:${data.resource_id}:${r.id}`
		});
	}
	await automationCancelHooks.quoteAccepted(data);
}

async function handleMessageReceived(data: EventJobData) {
	if (!data.org_id) return;
	const conversationId = (data.payload.conversation_id as string | undefined) ?? data.resource_id;
	const recipients = await messageRecipients(data.org_id, conversationId);
	const customerName = (data.payload.contact_name as string | undefined) ?? '';
	const preview = (data.payload.preview as string | undefined) ?? '';
	const phone = (data.payload.phone as string | undefined) ?? '';
	const title = customerName ? `New message from ${customerName}` : 'New message';

	for (const r of recipients) {
		await dispatchToMember({
			orgId: data.org_id,
			memberId: r.id,
			type: 'message_received',
			title,
			body: preview || null,
			resourceType: 'conversation',
			resourceId: conversationId,
			route: NOTIFICATION_SPEC.message_received.route(conversationId),
			metadata: {
				customer_name: customerName,
				phone_number: phone,
				conversation_id: conversationId
			}
		});
	}
}

async function handleReviewReceived(data: EventJobData) {
	if (!data.org_id) return;
	const recipients = await membersWithPermission(data.org_id, 'can_view_reviews');
	const customerName = (data.payload.reviewer_name as string | undefined) ?? '';
	const title = customerName ? `${customerName} left you a review` : 'New review received';
	for (const r of recipients) {
		await dispatchToMember({
			orgId: data.org_id,
			memberId: r.id,
			type: 'new_review',
			title,
			body: (data.payload.summary as string | undefined) ?? null,
			resourceType: 'review',
			resourceId: data.resource_id,
			route: NOTIFICATION_SPEC.new_review.route(data.resource_id),
			metadata: { customer_name: customerName }
		});
	}
}

async function handlePrivateFeedback(data: EventJobData) {
	if (!data.org_id) return;
	const recipients = await membersWithPermission(data.org_id, 'can_view_negative_feedback');
	const customerName = (data.payload.customer_name as string | undefined) ?? '';
	const title = customerName
		? `Negative feedback from ${customerName}`
		: 'Negative feedback received';
	for (const r of recipients) {
		await dispatchToMember({
			orgId: data.org_id,
			memberId: r.id,
			type: 'negative_feedback',
			title,
			body: (data.payload.summary as string | undefined) ?? null,
			resourceType: 'private_feedback',
			resourceId: data.resource_id,
			route: NOTIFICATION_SPEC.negative_feedback.route(data.resource_id),
			metadata: { customer_name: customerName }
		});
	}
}

async function handleCallMissed(data: EventJobData) {
	if (!data.org_id) return;
	const recipients = await adminManagerMembers(data.org_id);
	const from = (data.payload.from as string | undefined) ?? '';
	const contactName = (data.payload.contact_name as string | undefined) ?? '';
	const conversationId = (data.payload.conversation_id as string | undefined) ?? data.resource_id;
	const contactId = (data.payload.contact_id as string | undefined) ?? data.resource_id;
	const title = contactName
		? `Missed call from ${contactName}`
		: from
			? `Missed call from ${from}`
			: 'Missed call';
	await dispatchNotification(
		data.org_id,
		recipients,
		{
			type: 'call.missed',
			title,
			body: from || null,
			resource_type: 'conversation',
			resource_id: conversationId,
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

async function handleContactFollowUpDue(data: EventJobData) {
	if (!data.org_id) return;
	// The sweep only emits for assigned contacts, but guard anyway — a reminder
	// with no owner has nobody to notify.
	const assignedTo = data.payload.assigned_to;
	if (typeof assignedTo !== 'string' || assignedTo.length === 0) return;
	const fullName = (data.payload.full_name as string | undefined) ?? '';
	const dueAt = (data.payload.due_at as string | undefined) ?? null;
	const title = fullName ? `Follow up with ${fullName}` : 'Follow-up due';
	await dispatchToMember({
		orgId: data.org_id,
		memberId: assignedTo,
		type: 'contact_follow_up_due',
		title,
		body: 'A follow-up you scheduled is due',
		resourceType: 'contact',
		resourceId: data.resource_id,
		route: NOTIFICATION_SPEC.contact_follow_up_due.route(data.resource_id),
		metadata: { contact_name: fullName, due_at: dueAt },
		// One reminder per scheduled due instant; survives outbox retries.
		idempotencyKey: `contact.follow_up_due:${data.resource_id}:${dueAt}`
	});
}

async function handleInvoiceViewed(data: EventJobData) {
	if (!data.org_id) return;
	const recipients = await adminManagerMembers(data.org_id);
	const customerName = (data.payload.customer_name as string | undefined) ?? '';
	const invoiceNumber = (data.payload.invoice_number as string | undefined) ?? '';
	const amountFormatted = (data.payload.amount_formatted as string | undefined) ?? '';

	const titleParts: string[] = [];
	if (customerName) titleParts.push(customerName);
	titleParts.push('just opened your');
	if (amountFormatted) titleParts.push(`${amountFormatted} invoice`);
	else if (invoiceNumber) titleParts.push(`invoice ${invoiceNumber}`);
	else titleParts.push('invoice');
	const title = titleParts.join(' ');

	for (const r of recipients) {
		await dispatchToMember({
			orgId: data.org_id,
			memberId: r.id,
			type: 'invoice_viewed',
			title,
			body: 'Tap to view and follow up',
			resourceType: 'invoice',
			resourceId: data.resource_id,
			route: NOTIFICATION_SPEC.invoice_viewed.route(data.resource_id),
			metadata: {
				customer_name: customerName,
				invoice_number: invoiceNumber,
				amount_formatted: amountFormatted
			}
		});
	}
}

async function handlePaymentRecorded(data: EventJobData) {
	if (!data.org_id) return;

	// 1. Contractor notification with push
	const recipients = await adminManagerMembers(data.org_id);
	const customerName = (data.payload.customer_name as string | undefined) ?? '';
	const amountFormatted = (data.payload.amount_formatted as string | undefined) ?? '';
	const title =
		customerName && amountFormatted
			? `${customerName} paid ${amountFormatted}`
			: amountFormatted
				? `Payment of ${amountFormatted} received`
				: 'Payment received';

	for (const r of recipients) {
		await dispatchToMember({
			orgId: data.org_id,
			memberId: r.id,
			type: 'payment_received',
			title,
			body: 'Money landed in your account',
			resourceType: 'invoice',
			resourceId: data.resource_id,
			route: NOTIFICATION_SPEC.payment_received.route(data.resource_id),
			metadata: { customer_name: customerName, amount_formatted: amountFormatted },
			idempotencyKey: `payment.recorded:${data.resource_id}:${r.id}`
		});
	}

	// 2. Transactional receipt to customer — two-tier gates:
	//    jafar layer: org.feature_payment_receipt (capability), org.payment_receipt_sms_allowed (SMS channel)
	//    contractor layer: settings.payment_receipt_enabled (email), settings.payment_receipt_sms_enabled (SMS)
	// Email is always allowed when capability is on; SMS requires both the capability
	// and the SMS allowance. Silent no-op if both channels resolve false.
	const paymentId = data.payload.payment_id as string | undefined;
	if (!paymentId) return;

	const [settings] = await db
		.select()
		.from(automationSettings)
		.where(eq(automationSettings.org_id, data.org_id));
	if (!settings) return;

	const [org] = await db
		.select({
			name: organizations.name,
			feature_payment_receipt: organizations.feature_payment_receipt,
			payment_receipt_sms_allowed: organizations.payment_receipt_sms_allowed
		})
		.from(organizations)
		.where(eq(organizations.id, data.org_id))
		.limit(1);
	if (!org || !org.feature_payment_receipt) return;

	const [invoiceRow] = await db
		.select({ id: invoices.id, contact_id: invoices.contact_id, total: invoices.total })
		.from(invoices)
		.where(eq(invoices.id, data.resource_id))
		.limit(1);
	if (!invoiceRow) return;

	const [contact] = await db
		.select({
			id: contacts.id,
			full_name: contacts.full_name,
			email: contacts.email,
			phone: contacts.phone,
			sms_opt_out: contacts.sms_opt_out
		})
		.from(contacts)
		.where(eq(contacts.id, invoiceRow.contact_id))
		.limit(1);
	if (!contact) return;

	const [payment] = await db
		.select({ amount: payments.amount, receipt_sent_at: payments.receipt_sent_at })
		.from(payments)
		.where(eq(payments.id, paymentId))
		.limit(1);
	if (!payment) return;

	// Idempotency: receipt_sent_at is set once after first successful channel.
	// Re-deliveries of the same outbox event no-op the whole block.
	if (payment.receipt_sent_at) return;

	const receiptAmountFormatted = amountFormatted ?? `$${Number(payment.amount).toFixed(2)}`;
	const interpolationVars = {
		contact_name: contact.full_name,
		org_name: org.name,
		amount: receiptAmountFormatted
	};

	const canSendEmail = settings.payment_receipt_enabled && Boolean(contact.email);
	const canSendSms =
		settings.payment_receipt_sms_enabled &&
		org.payment_receipt_sms_allowed &&
		Boolean(contact.phone) &&
		!contact.sms_opt_out;

	if (!canSendEmail && !canSendSms) return;

	let emailSent = false;
	let smsSent = false;

	if (canSendEmail) {
		try {
			await queueAutomationEmail(db, {
				orgId: data.org_id,
				contactId: contact.id,
				contactEmail: contact.email!,
				subject: `Payment receipt from ${org.name}`,
				body: interpolate(settings.payment_receipt_message, interpolationVars),
				source: 'automation.payment_receipt'
			});
			emailSent = true;
		} catch (err) {
			console.error('[notification] payment receipt email failed:', err);
		}
	}

	if (canSendSms) {
		try {
			await queueAutomationSms(db, {
				orgId: data.org_id,
				contactId: contact.id,
				body: interpolate(settings.payment_receipt_sms_message, interpolationVars),
				source: 'automation.payment_receipt'
			});
			smsSent = true;
		} catch (err) {
			console.error('[notification] payment receipt sms failed:', err);
		}
	}

	if (emailSent || smsSent) {
		const via = emailSent && smsSent ? 'both' : emailSent ? 'email' : 'sms';
		await db
			.update(payments)
			.set({ receipt_sent_at: new Date(), receipt_sent_via: via })
			.where(eq(payments.id, paymentId));
	}
}

// Admins/managers (visibility) ∪ all crew assignees (execution awareness),
// deduped by member_id. Customer-facing comms are handled elsewhere.
async function appointmentStaffRecipients(orgId: string, appointmentId: string) {
	const [admins, crew] = await Promise.all([
		adminManagerMembers(orgId),
		loadAssigneeMemberIds(db, appointmentId)
	]);
	const seen = new Set<string>();
	const out: { id: string }[] = [];
	for (const r of admins) {
		if (!seen.has(r.id)) {
			seen.add(r.id);
			out.push(r);
		}
	}
	for (const id of crew) {
		if (!seen.has(id)) {
			seen.add(id);
			out.push({ id });
		}
	}
	return out;
}

async function handleAppointmentCancelled(data: EventJobData) {
	if (!data.org_id) return;
	const recipients = await appointmentStaffRecipients(data.org_id, data.resource_id);
	const customerName = (data.payload.contact_name as string | undefined) ?? '';
	const title = customerName
		? `${customerName} cancelled their appointment`
		: 'Appointment cancelled';
	for (const r of recipients) {
		await dispatchToMember({
			orgId: data.org_id,
			memberId: r.id,
			type: 'appointment_cancelled',
			title,
			body: null,
			resourceType: 'appointment',
			resourceId: data.resource_id,
			route: NOTIFICATION_SPEC.appointment_cancelled.route(data.resource_id),
			metadata: { customer_name: customerName },
			idempotencyKey: `appointment.cancelled:${data.resource_id}:${r.id}`
		});
	}
}

async function handleAppointmentRescheduled(data: EventJobData) {
	if (!data.org_id) return;
	const recipients = await appointmentStaffRecipients(data.org_id, data.resource_id);
	const customerName = (data.payload.contact_name as string | undefined) ?? '';
	const title = customerName
		? `${customerName} rescheduled their appointment`
		: 'Appointment rescheduled';
	for (const r of recipients) {
		await dispatchToMember({
			orgId: data.org_id,
			memberId: r.id,
			type: 'appointment_rescheduled',
			title,
			body: null,
			resourceType: 'appointment',
			resourceId: data.resource_id,
			route: NOTIFICATION_SPEC.appointment_rescheduled.route(data.resource_id),
			metadata: {
				customer_name: customerName,
				scheduled_start: (data.payload.scheduled_start as string | undefined) ?? null
			},
			idempotencyKey: `appointment.rescheduled:${data.resource_id}:${r.id}`
		});
	}
}

async function handleAppointmentNoShow(data: EventJobData) {
	if (!data.org_id) return;
	const recipients = await appointmentStaffRecipients(data.org_id, data.resource_id);
	const customerName = (data.payload.contact_name as string | undefined) ?? '';
	const title = customerName ? `${customerName} didn't show up` : "Customer didn't show up";
	for (const r of recipients) {
		await dispatchToMember({
			orgId: data.org_id,
			memberId: r.id,
			type: 'appointment_no_show',
			title,
			body: 'You had a no-show appointment',
			resourceType: 'appointment',
			resourceId: data.resource_id,
			route: NOTIFICATION_SPEC.appointment_no_show.route(data.resource_id),
			metadata: { customer_name: customerName },
			idempotencyKey: `appointment.no_show:${data.resource_id}:${r.id}`
		});
	}
}

async function handleSmsCreditLow(data: EventJobData) {
	if (!data.org_id) return;
	const recipients = await adminManagerMembers(data.org_id);
	const balance = Number(data.payload.balance_after ?? 0).toFixed(2);
	for (const r of recipients) {
		await dispatchToMember({
			orgId: data.org_id,
			memberId: r.id,
			type: 'sms_credit_low',
			title: 'SMS credit running low',
			body: `Only $${balance} left. Contact support to top up so your texts keep sending.`,
			resourceType: 'organization',
			resourceId: data.resource_id,
			route: NOTIFICATION_SPEC.sms_credit_low.route(data.resource_id),
			// Stable across retries of this outbox event, unique per low-credit episode.
			idempotencyKey: `sms.credit_low:${data.outbox_event_id}:${r.id}`
		});
	}
}

export const notificationWorker = new Worker<EventJobData>(
	NOTIFICATION_QUEUE,
	async (job: Job<EventJobData>) => {
		const data = job.data;
		switch (job.name) {
			case 'opportunity.created':
				return handleOpportunityCreated(data);
			case 'opportunity.assignee_changed':
				return handleOpportunityAssigneeChanged(data);
			case 'opportunity.lost':
				return handleOpportunityLost(data);
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
			case 'contact.follow_up_due':
				return handleContactFollowUpDue(data);
			case 'sms.credit_low':
				return handleSmsCreditLow(data);
			case 'invoice.viewed':
				return handleInvoiceViewed(data);
			case 'payment.recorded':
				return handlePaymentRecorded(data);
			case 'appointment.cancelled':
				return handleAppointmentCancelled(data);
			case 'appointment.rescheduled':
				return handleAppointmentRescheduled(data);
			case 'appointment.no_show':
				return handleAppointmentNoShow(data);
			default:
				console.warn(`[notification] unknown job name: ${job.name}`);
		}
	},
	{ connection: redisConnection(), concurrency: Number(env.NOTIFICATION_WORKER_CONCURRENCY ?? '5') }
);

notificationWorker.on('failed', (job, err) => {
	console.error(`[notification] job ${job?.id} (${job?.name}) failed:`, err.message);
});
