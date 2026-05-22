import { Worker, type Job } from 'bullmq';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import {
	appointments,
	automationJobs,
	automationSettings,
	contacts,
	invoices,
	organizations,
	quotes,
	reviewRequests,
	type AutomationJob
} from '$lib/server/db/schema';
import { queueAutomationSms } from '$lib/server/conversations/queueAutomationSms';
import { queueAutomationEmail } from '$lib/server/conversations/queueAutomationEmail';
import {
	AUTOMATION_QUEUE,
	addJob,
	automationQueue,
	redisConnection
} from '$lib/server/queue/bullmq';
import { interpolate } from './templates';
import { featureForAutomationJob } from '$lib/permissions/featureMap';
import type { FeatureFlagKey } from '$lib/types';

const FEATURE_CACHE_TTL_MS = 15_000;
const featureCache = new Map<string, { value: boolean; expiresAt: number }>();

async function isFeatureEnabled(orgId: string, feature: FeatureFlagKey): Promise<boolean> {
	const cacheKey = `${orgId}:${feature}`;
	const cached = featureCache.get(cacheKey);
	const now = Date.now();
	if (cached && cached.expiresAt > now) return cached.value;
	const [row] = await db.select().from(organizations).where(eq(organizations.id, orgId));
	const value = Boolean(row?.[feature]);
	featureCache.set(cacheKey, { value, expiresAt: now + FEATURE_CACHE_TTL_MS });
	return value;
}
const env = process.env;

type EventJobData = {
	outbox_event_id: string;
	event_type: string;
	org_id: string | null;
	resource_type: string;
	resource_id: string;
	payload: Record<string, unknown>;
};

async function loadContext(orgId: string) {
	const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId));
	const [settings] = await db
		.select()
		.from(automationSettings)
		.where(eq(automationSettings.org_id, orgId));
	return { org, settings };
}

async function loadContact(orgId: string, contactId: string) {
	const [contact] = await db
		.select()
		.from(contacts)
		.where(and(eq(contacts.id, contactId), eq(contacts.org_id, orgId), isNull(contacts.deleted_at)));
	return contact ?? null;
}

async function insertAutomationJob(
	row: Omit<AutomationJob, 'id' | 'created_at' | 'updated_at' | 'attempts' | 'last_error' | 'started_at' | 'completed_at' | 'failed_at'> & { bull_job_id: string }
) {
	const [inserted] = await db
		.insert(automationJobs)
		.values({
			org_id: row.org_id,
			type: row.type,
			resource_type: row.resource_type,
			resource_id: row.resource_id,
			bull_job_id: row.bull_job_id,
			status: row.status ?? 'pending',
			scheduled_for: row.scheduled_for ?? null
		})
		.returning();
	return inserted;
}

async function markJobStarted(automationJobId: string) {
	await db
		.update(automationJobs)
		.set({ status: 'processing', started_at: new Date(), updated_at: new Date() })
		.where(eq(automationJobs.id, automationJobId));
}

async function markJobCompleted(automationJobId: string) {
	await db
		.update(automationJobs)
		.set({ status: 'completed', completed_at: new Date(), updated_at: new Date() })
		.where(eq(automationJobs.id, automationJobId));
}

async function markJobFailed(automationJobId: string, err: unknown) {
	await db
		.update(automationJobs)
		.set({
			status: 'failed',
			failed_at: new Date(),
			last_error: err instanceof Error ? err.message : String(err),
			updated_at: new Date()
		})
		.where(eq(automationJobs.id, automationJobId));
}

async function isJobCancelled(automationJobId: string): Promise<boolean> {
	const [row] = await db
		.select({ status: automationJobs.status })
		.from(automationJobs)
		.where(eq(automationJobs.id, automationJobId));
	return row?.status === 'cancelled';
}

async function cancelPendingJobs(
	orgId: string,
	type: AutomationJob['type'],
	resourceId: string
): Promise<void> {
	const pending = await db
		.select()
		.from(automationJobs)
		.where(
			and(
				eq(automationJobs.org_id, orgId),
				eq(automationJobs.type, type),
				eq(automationJobs.resource_id, resourceId),
				eq(automationJobs.status, 'pending')
			)
		);
	if (pending.length === 0) return;
	const q = automationQueue();
	for (const row of pending) {
		try {
			const bullJob = await q.getJob(row.bull_job_id);
			if (bullJob) await bullJob.remove();
		} catch (err) {
			console.warn(`[automation] failed to remove bull job ${row.bull_job_id}:`, err);
		}
	}
	await db
		.update(automationJobs)
		.set({ status: 'cancelled', updated_at: new Date() })
		.where(inArray(automationJobs.id, pending.map((r) => r.id)));
}

// ---- Handlers ----

async function handleSpeedToLead(data: EventJobData) {
	if (!data.org_id) return;
	const { org, settings } = await loadContext(data.org_id);
	if (!org || !settings || !settings.speed_to_lead_enabled) return;
	const contact = await loadContact(data.org_id, data.resource_id);
	if (!contact || contact.sms_opt_out) return;

	const bullJobId = `speed_to_lead:${data.outbox_event_id}`;
	const automationJob = await insertAutomationJob({
		org_id: data.org_id,
		type: 'speed_to_lead',
		resource_type: 'contact',
		resource_id: contact.id,
		bull_job_id: bullJobId,
		status: 'processing',
		scheduled_for: new Date()
	});
	try {
		const body = interpolate(settings.speed_to_lead_message, {
			contact_name: contact.full_name,
			org_name: org.name
		});
		await queueAutomationSms(db, {
			orgId: data.org_id,
			contactId: contact.id,
			body,
			source: 'automation.speed_to_lead'
		});
		await markJobCompleted(automationJob.id);
	} catch (err) {
		await markJobFailed(automationJob.id, err);
		throw err;
	}
}

async function handleMissedCallTextback(data: EventJobData) {
	if (!data.org_id) return;
	const { org, settings } = await loadContext(data.org_id);
	if (!org || !settings || !settings.missed_call_textback_enabled) return;

	const missedCallConversationId = data.payload.conversation_id as string | undefined;
	const contactId = data.payload.contact_id as string | undefined;
	if (!missedCallConversationId || !contactId) return;

	const contact = await loadContact(data.org_id, contactId);
	if (!contact || contact.sms_opt_out) return;

	const bullJobId = `missed_call_textback:${data.outbox_event_id}`;
	const automationJob = await insertAutomationJob({
		org_id: data.org_id,
		type: 'missed_call_textback',
		resource_type: 'conversation',
		resource_id: missedCallConversationId,
		bull_job_id: bullJobId,
		status: 'processing',
		scheduled_for: new Date()
	});

	try {
		const body = interpolate(settings.missed_call_textback_message, {
			contact_name: contact.full_name,
			org_name: org.name
		});

		// Unified inbox: the missed-call conversation IS the customer thread.
		// Queue the outbound SMS on that conversation; smsWorker drives delivery.
		await queueAutomationSms(db, {
			orgId: data.org_id,
			contactId: contact.id,
			body,
			source: 'automation.missed_call_textback',
			conversationId: missedCallConversationId
		});

		await markJobCompleted(automationJob.id);
	} catch (err) {
		await markJobFailed(automationJob.id, err);
		throw err;
	}
}

async function scheduleQuoteFollowup(
	orgId: string,
	quoteId: string,
	followupNumber: 1 | 2,
	delayMs: number
) {
	const bullJob = await addJob(
		automationQueue(),
		'quote_followup',
		{
			outbox_event_id: `quote_followup:${quoteId}:${followupNumber}`,
			event_type: 'quote.followup',
			org_id: orgId,
			resource_type: 'quote',
			resource_id: quoteId,
			payload: { quote_id: quoteId, followup_number: followupNumber }
		},
		{ delay: delayMs }
	);
	await insertAutomationJob({
		org_id: orgId,
		type: 'quote_followup',
		resource_type: 'quote',
		resource_id: quoteId,
		bull_job_id: String(bullJob.id),
		status: 'pending',
		scheduled_for: new Date(Date.now() + delayMs)
	});
}

function publicQuoteUrl(token: string): string {
	const base = env.APP_URL ?? 'http://localhost:5173';
	return `${base.replace(/\/$/, '')}/q/${token}`;
}

function publicInvoiceUrl(token: string): string {
	const base = env.APP_URL ?? 'http://localhost:5173';
	return `${base.replace(/\/$/, '')}/i/${token}`;
}

async function dispatchInitialQuote(data: EventJobData) {
	if (!data.org_id) return;
	const orgId = data.org_id;
	const { org } = await loadContext(orgId);
	if (!org) return;

	const contactId = data.payload.contact_id as string | undefined;
	const rawToken = data.payload.public_token as string | undefined;
	const totalFormatted = (data.payload.total_formatted as string | undefined) ?? '';
	const quoteNumberDisplay = (data.payload.quote_number_display as string | undefined) ?? '';
	const isResend = Boolean(data.payload.is_resend);
	const hasEmail = Boolean(data.payload.has_email);
	if (!contactId || !rawToken) return;

	const contact = await loadContact(orgId, contactId);
	if (!contact) return;

	const url = publicQuoteUrl(rawToken);

	if (!contact.sms_opt_out) {
		const verb = isResend ? 'updated your quote' : 'sent you a quote';
		const body = `Hi ${contact.full_name}, ${org.name} ${verb} (${quoteNumberDisplay}, ${totalFormatted}). View it here: ${url}`;
		try {
			await queueAutomationSms(db, {
				orgId,
				contactId: contact.id,
				body,
				source: 'automation.quote_initial'
			});
		} catch (err) {
			console.error('[automation] quote SMS queue failed:', err);
		}
	}

	if (hasEmail && contact.email) {
		try {
			const verb = isResend ? 'updated your quote' : 'sent you a quote';
			const subject = isResend
				? `Updated quote ${quoteNumberDisplay} from ${org.name}`
				: `Your quote ${quoteNumberDisplay} from ${org.name}`;
			const body = `Hi ${contact.full_name},

${org.name} has ${verb} (${quoteNumberDisplay}, ${totalFormatted}).

View your quote:
${url}`;
			await queueAutomationEmail(db, {
				orgId,
				contactId: contact.id,
				contactEmail: contact.email,
				subject,
				body,
				source: 'automation.quote_initial'
			});
		} catch (err) {
			console.error('[automation] quote email dispatch failed:', err);
		}
	}
}

async function handleQuoteFollowupSetup(data: EventJobData) {
	if (!data.org_id) return;
	// Resends: cancel any existing pending follow-ups first.
	if (data.payload.is_resend) {
		await cancelPendingJobs(data.org_id, 'quote_followup', data.resource_id);
	}
	// Send initial SMS/email synchronously (with internal try/catch — failures
	// must not block follow-up scheduling).
	await dispatchInitialQuote(data);
	const { settings } = await loadContext(data.org_id);
	if (!settings || !settings.quote_followup_enabled) return;
	await scheduleQuoteFollowup(
		data.org_id,
		data.resource_id,
		1,
		settings.quote_followup_delay_1_hours * 3600_000
	);
}

async function handleQuoteFollowup(job: Job, data: EventJobData) {
	if (!data.org_id) return;
	const followupNumber = (data.payload.followup_number as 1 | 2) ?? 1;

	const [automationJobRow] = await db
		.select()
		.from(automationJobs)
		.where(eq(automationJobs.bull_job_id, String(job.id)));
	if (automationJobRow && (await isJobCancelled(automationJobRow.id))) return;

	const { org, settings } = await loadContext(data.org_id);
	if (!org || !settings || !settings.quote_followup_enabled) {
		if (automationJobRow) await markJobCompleted(automationJobRow.id);
		return;
	}

	const [quote] = await db
		.select()
		.from(quotes)
		.where(and(eq(quotes.id, data.resource_id), isNull(quotes.deleted_at)));
	if (!quote || (quote.status !== 'sent' && quote.status !== 'viewed')) {
		if (automationJobRow) await markJobCompleted(automationJobRow.id);
		return;
	}

	const contact = await loadContact(data.org_id, quote.contact_id);
	if (!contact || contact.sms_opt_out) {
		if (automationJobRow) await markJobCompleted(automationJobRow.id);
		return;
	}

	if (automationJobRow) await markJobStarted(automationJobRow.id);
	try {
		const body = interpolate(settings.quote_followup_message, {
			contact_name: contact.full_name,
			org_name: org.name
		});
		await queueAutomationSms(db, {
			orgId: data.org_id,
			contactId: contact.id,
			body,
			source: `automation.quote_followup_${followupNumber}`
		});
		if (automationJobRow) await markJobCompleted(automationJobRow.id);

		if (followupNumber === 1) {
			const delta = (settings.quote_followup_delay_2_hours - settings.quote_followup_delay_1_hours) * 3600_000;
			if (delta > 0) {
				await scheduleQuoteFollowup(data.org_id, quote.id, 2, delta);
			}
		}
	} catch (err) {
		if (automationJobRow) await markJobFailed(automationJobRow.id, err);
		throw err;
	}
}

async function handleInvoiceDispatch(data: EventJobData) {
	if (!data.org_id) return;
	const orgId = data.org_id;
	const { org } = await loadContext(orgId);
	if (!org) return;

	const contactId = data.payload.contact_id as string | undefined;
	const rawToken = data.payload.public_token as string | undefined;
	const totalFormatted = (data.payload.total_formatted as string | undefined) ?? '';
	const amountDueFormatted = (data.payload.amount_due_formatted as string | undefined) ?? '';
	const invoiceNumberDisplay = (data.payload.invoice_number_display as string | undefined) ?? '';
	const hasEmail = Boolean(data.payload.has_email);
	const dueDate = data.payload.due_date as string | null | undefined;
	if (!contactId) return;

	const contact = await loadContact(orgId, contactId);
	if (!contact) return;

	if (rawToken) {
		const url = publicInvoiceUrl(rawToken);
		const dueLine = dueDate ? ` Due ${new Date(dueDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}.` : '';

		if (!contact.sms_opt_out) {
			const smsBody = `Hi ${contact.full_name}, ${org.name} sent you invoice ${invoiceNumberDisplay} for ${totalFormatted}.${dueLine} Pay here: ${url}`;
			try {
				await queueAutomationSms(db, {
					orgId,
					contactId: contact.id,
					body: smsBody,
					source: 'automation.invoice_initial'
				});
			} catch (err) {
				console.error('[automation] invoice SMS dispatch failed:', err);
			}
		}

		if (hasEmail && contact.email) {
			try {
				const emailBody = `Hi ${contact.full_name},

${org.name} has sent you invoice ${invoiceNumberDisplay} for ${amountDueFormatted}.${dueDate ? `\n\nDue date: ${new Date(dueDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}` : ''}

View and pay your invoice:
${url}`;
				await queueAutomationEmail(db, {
					orgId,
					contactId: contact.id,
					contactEmail: contact.email,
					subject: `Invoice ${invoiceNumberDisplay} from ${org.name}`,
					body: emailBody,
					source: 'automation.invoice_initial'
				});
			} catch (err) {
				console.error('[automation] invoice email dispatch failed:', err);
			}
		}
	}
}

async function handleInvoiceReminderSetup(data: EventJobData) {
	if (!data.org_id) return;
	const { settings } = await loadContext(data.org_id);
	if (!settings || !settings.invoice_reminder_enabled) return;
	const delayMs = settings.invoice_reminder_delay_days * 24 * 3600_000;
	const bullJob = await addJob(
		automationQueue(),
		'invoice_reminder',
		{
			outbox_event_id: `invoice_reminder:${data.resource_id}`,
			event_type: 'invoice.reminder',
			org_id: data.org_id,
			resource_type: 'invoice',
			resource_id: data.resource_id,
			payload: {}
		},
		{ delay: delayMs }
	);
	await insertAutomationJob({
		org_id: data.org_id,
		type: 'invoice_reminder',
		resource_type: 'invoice',
		resource_id: data.resource_id,
		bull_job_id: String(bullJob.id),
		status: 'pending',
		scheduled_for: new Date(Date.now() + delayMs)
	});
}

async function handleInvoiceReminder(job: Job, data: EventJobData) {
	if (!data.org_id) return;
	const [automationJobRow] = await db
		.select()
		.from(automationJobs)
		.where(eq(automationJobs.bull_job_id, String(job.id)));
	if (automationJobRow && (await isJobCancelled(automationJobRow.id))) return;

	const { org, settings } = await loadContext(data.org_id);
	if (!org || !settings || !settings.invoice_reminder_enabled) {
		if (automationJobRow) await markJobCompleted(automationJobRow.id);
		return;
	}

	const [invoice] = await db
		.select()
		.from(invoices)
		.where(and(eq(invoices.id, data.resource_id), isNull(invoices.deleted_at)));
	if (!invoice || invoice.status === 'paid' || invoice.status === 'cancelled') {
		if (automationJobRow) await markJobCompleted(automationJobRow.id);
		return;
	}
	const contact = await loadContact(data.org_id, invoice.contact_id);
	if (!contact || contact.sms_opt_out) {
		if (automationJobRow) await markJobCompleted(automationJobRow.id);
		return;
	}

	if (automationJobRow) await markJobStarted(automationJobRow.id);
	try {
		const body = interpolate(settings.invoice_reminder_message, {
			contact_name: contact.full_name,
			org_name: org.name
		});
		await queueAutomationSms(db, {
			orgId: data.org_id,
			contactId: contact.id,
			body,
			source: 'automation.invoice_reminder'
		});
		if (automationJobRow) await markJobCompleted(automationJobRow.id);
	} catch (err) {
		if (automationJobRow) await markJobFailed(automationJobRow.id, err);
		throw err;
	}
}

async function handleReviewRequestSetup(data: EventJobData) {
	if (!data.org_id) return;
	const { settings } = await loadContext(data.org_id);
	if (!settings || !settings.review_funnel_enabled) return;
	const delayMs = settings.review_funnel_delay_hours * 3600_000;
	const bullJob = await addJob(
		automationQueue(),
		'review_request',
		{
			outbox_event_id: `review_request:${data.resource_id}`,
			event_type: 'review.request',
			org_id: data.org_id,
			resource_type: 'job',
			resource_id: data.resource_id,
			payload: data.payload
		},
		{ delay: delayMs }
	);
	await insertAutomationJob({
		org_id: data.org_id,
		type: 'review_request',
		resource_type: 'job',
		resource_id: data.resource_id,
		bull_job_id: String(bullJob.id),
		status: 'pending',
		scheduled_for: new Date(Date.now() + delayMs)
	});
}

async function handleReviewRequest(job: Job, data: EventJobData) {
	if (!data.org_id) return;
	const [automationJobRow] = await db
		.select()
		.from(automationJobs)
		.where(eq(automationJobs.bull_job_id, String(job.id)));
	if (automationJobRow && (await isJobCancelled(automationJobRow.id))) return;

	const { org, settings } = await loadContext(data.org_id);
	if (!org || !settings || !settings.review_funnel_enabled) {
		if (automationJobRow) await markJobCompleted(automationJobRow.id);
		return;
	}

	const contactId = data.payload.contact_id as string | undefined;
	if (!contactId) {
		if (automationJobRow) await markJobCompleted(automationJobRow.id);
		return;
	}
	const contact = await loadContact(data.org_id, contactId);
	if (!contact || contact.sms_opt_out) {
		if (automationJobRow) await markJobCompleted(automationJobRow.id);
		return;
	}

	if (automationJobRow) await markJobStarted(automationJobRow.id);
	try {
		await db.transaction(async (tx) => {
			await tx
				.insert(reviewRequests)
				.values({
					org_id: data.org_id!,
					job_id: data.resource_id,
					contact_id: contact.id,
					status: 'sent',
					sent_by_automation: true,
					sent_at: new Date()
				})
				.onConflictDoNothing({ target: reviewRequests.job_id });
		});

		const body = interpolate(settings.review_funnel_message, {
			contact_name: contact.full_name,
			org_name: org.name
		});
		await queueAutomationSms(db, {
			orgId: data.org_id,
			contactId: contact.id,
			body,
			source: 'automation.review_request'
		});
		if (automationJobRow) await markJobCompleted(automationJobRow.id);
	} catch (err) {
		if (automationJobRow) await markJobFailed(automationJobRow.id, err);
		throw err;
	}
}

async function handleAppointmentReminderSetup(data: EventJobData) {
	if (!data.org_id) return;
	const { settings } = await loadContext(data.org_id);
	if (!settings || !settings.appointment_reminder_enabled) return;

	const appointmentId = data.resource_id;
	const [appointment] = await db
		.select()
		.from(appointments)
		.where(and(eq(appointments.id, appointmentId), isNull(appointments.deleted_at)));
	if (!appointment || appointment.status !== 'scheduled') return;

	const now = Date.now();
	const scheduledStartMs = appointment.scheduled_start.getTime();
	const delay24 = scheduledStartMs - 24 * 3600_000 - now;
	const delay1 = scheduledStartMs - 1 * 3600_000 - now;

	if (delay24 > 0) {
		const bullJob = await addJob(
			automationQueue(),
			'appointment_reminder_24h',
			{
				outbox_event_id: `appt_24h:${appointmentId}`,
				event_type: 'appointment.reminder_24h',
				org_id: data.org_id,
				resource_type: 'appointment',
				resource_id: appointmentId,
				payload: { scheduled_start: appointment.scheduled_start.toISOString() }
			},
			{ delay: delay24 }
		);
		await insertAutomationJob({
			org_id: data.org_id,
			type: 'appointment_reminder',
			resource_type: 'appointment',
			resource_id: appointmentId,
			bull_job_id: String(bullJob.id),
			status: 'pending',
			scheduled_for: new Date(now + delay24)
		});
	}
	if (delay1 > 0) {
		const bullJob = await addJob(
			automationQueue(),
			'appointment_reminder_1h',
			{
				outbox_event_id: `appt_1h:${appointmentId}`,
				event_type: 'appointment.reminder_1h',
				org_id: data.org_id,
				resource_type: 'appointment',
				resource_id: appointmentId,
				payload: { scheduled_start: appointment.scheduled_start.toISOString() }
			},
			{ delay: delay1 }
		);
		await insertAutomationJob({
			org_id: data.org_id,
			type: 'appointment_reminder',
			resource_type: 'appointment',
			resource_id: appointmentId,
			bull_job_id: String(bullJob.id),
			status: 'pending',
			scheduled_for: new Date(now + delay1)
		});
	}
}

async function handleAppointmentRescheduled(data: EventJobData) {
	if (!data.org_id) return;
	await cancelPendingJobs(data.org_id, 'appointment_reminder', data.resource_id);
	await handleAppointmentReminderSetup(data);
}

async function handleAppointmentReminder(
	job: Job,
	data: EventJobData,
	variant: '24h' | '1h'
) {
	if (!data.org_id) return;
	const [automationJobRow] = await db
		.select()
		.from(automationJobs)
		.where(eq(automationJobs.bull_job_id, String(job.id)));
	if (automationJobRow && (await isJobCancelled(automationJobRow.id))) return;

	const { org, settings } = await loadContext(data.org_id);
	if (!org || !settings || !settings.appointment_reminder_enabled) {
		if (automationJobRow) await markJobCompleted(automationJobRow.id);
		return;
	}

	const [appointment] = await db
		.select()
		.from(appointments)
		.where(and(eq(appointments.id, data.resource_id), isNull(appointments.deleted_at)));
	if (!appointment || appointment.status !== 'scheduled') {
		if (automationJobRow) await markJobCompleted(automationJobRow.id);
		return;
	}

	// Drift guard: silent exit if scheduled_start moved since enqueue.
	const expected = data.payload.scheduled_start as string | undefined;
	if (expected && new Date(expected).getTime() !== appointment.scheduled_start.getTime()) {
		if (automationJobRow) await markJobCompleted(automationJobRow.id);
		return;
	}

	const sentFlag = variant === '24h' ? appointment.reminder_24h_sent : appointment.reminder_1h_sent;
	if (sentFlag) {
		if (automationJobRow) await markJobCompleted(automationJobRow.id);
		return;
	}

	const contact = await loadContact(data.org_id, appointment.contact_id);
	if (!contact || contact.sms_opt_out) {
		if (automationJobRow) await markJobCompleted(automationJobRow.id);
		return;
	}

	if (automationJobRow) await markJobStarted(automationJobRow.id);
	try {
		// Use separate 1h message when enabled; fall back to the shared message.
		let messageTemplate = settings.appointment_reminder_message;
		if (
			variant === '1h' &&
			settings.appointment_reminder_1h_enabled &&
			settings.appointment_reminder_1h_message
		) {
			messageTemplate = settings.appointment_reminder_1h_message;
		}
		const body = interpolate(messageTemplate, {
			contact_name: contact.full_name,
			org_name: org.name
		});
		await queueAutomationSms(db, {
			orgId: data.org_id,
			contactId: contact.id,
			body,
			source: `automation.appointment_reminder_${variant}`
		});
		await db
			.update(appointments)
			.set({
				...(variant === '24h' ? { reminder_24h_sent: true } : { reminder_1h_sent: true }),
				updated_at: new Date()
			})
			.where(eq(appointments.id, appointment.id));
		if (automationJobRow) await markJobCompleted(automationJobRow.id);
	} catch (err) {
		if (automationJobRow) await markJobFailed(automationJobRow.id, err);
		throw err;
	}
}

// ---- Cancellation hooks invoked by outbox routing ----

async function handleQuoteAcceptedCancel(data: EventJobData) {
	if (!data.org_id) return;
	await cancelPendingJobs(data.org_id, 'quote_followup', data.resource_id);
}

async function handleQuoteDeclinedCancel(data: EventJobData) {
	if (!data.org_id) return;
	await cancelPendingJobs(data.org_id, 'quote_followup', data.resource_id);
}

async function handleQuoteViewedCancel(data: EventJobData) {
	if (!data.org_id) return;
	await cancelPendingJobs(data.org_id, 'quote_followup', data.resource_id);
}

async function handleQuoteChangesRequestedCancel(data: EventJobData) {
	if (!data.org_id) return;
	await cancelPendingJobs(data.org_id, 'quote_followup', data.resource_id);
}

async function handleInvoicePaidCancel(data: EventJobData) {
	if (!data.org_id) return;
	await cancelPendingJobs(data.org_id, 'invoice_reminder', data.resource_id);
}

// ---- Worker ----

export const automationWorker = new Worker<EventJobData>(
	AUTOMATION_QUEUE,
	async (job) => {
		const data = job.data;
		const requiredFeature = featureForAutomationJob(job.name);
		if (requiredFeature && data.org_id && !(await isFeatureEnabled(data.org_id, requiredFeature))) {
			console.warn(
				`[automation] dropped job ${job.id} name=${job.name} org=${data.org_id} reason=feature_disabled feature=${requiredFeature}`
			);
			return;
		}
		switch (job.name) {
			case 'speed_to_lead':
				return handleSpeedToLead(data);
			case 'missed_call_textback':
				return handleMissedCallTextback(data);
			case 'invoice_dispatch':
				return handleInvoiceDispatch(data);
			case 'quote_followup':
				if (data.event_type === 'quote.sent') return handleQuoteFollowupSetup(data);
				return handleQuoteFollowup(job, data);
			case 'invoice_reminder':
				if (data.event_type === 'invoice.overdue') return handleInvoiceReminderSetup(data);
				return handleInvoiceReminder(job, data);
			case 'review_request':
				if (data.event_type === 'job.completed') return handleReviewRequestSetup(data);
				return handleReviewRequest(job, data);
			case 'appointment_reminder':
				return handleAppointmentReminderSetup(data);
			case 'appointment_reschedule':
				return handleAppointmentRescheduled(data);
			case 'appointment_reminder_24h':
				return handleAppointmentReminder(job, data, '24h');
			case 'appointment_reminder_1h':
				return handleAppointmentReminder(job, data, '1h');
			default:
				console.warn(`[automation] unknown job name: ${job.name}`);
		}
	},
	{ connection: redisConnection(), concurrency: Number(env.AUTOMATION_WORKER_CONCURRENCY ?? '5') }
);

automationWorker.on('failed', (job, err) => {
	console.error(`[automation] job ${job?.id} (${job?.name}) failed:`, err.message);
});

// Cancellation events arrive on the notification queue; the notification worker
// invokes these helpers when the corresponding events are dispatched.
export const automationCancelHooks = {
	quoteAccepted: handleQuoteAcceptedCancel,
	quoteDeclined: handleQuoteDeclinedCancel,
	quoteViewed: handleQuoteViewedCancel,
	quoteChangesRequested: handleQuoteChangesRequestedCancel,
	invoicePaid: handleInvoicePaidCancel
};
