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
	outboxEvents,
	quotes,
	reviewRequests,
	type AutomationJob
} from '$lib/server/db/schema';
import { queueAutomationSms } from '$lib/server/conversations/queueAutomationSms';
import { queueAutomationEmail } from '$lib/server/conversations/queueAutomationEmail';
import { deactivatePaymentLink, getOrgStripeClient } from '$lib/server/invoices/stripe';
import {
	AUTOMATION_QUEUE,
	addJob,
	automationQueue,
	redisConnection
} from '$lib/server/queue/bullmq';
import { interpolate } from './templates';
import { generateReviewToken, reviewTokenExpiry } from '$lib/server/reputation/token';
import { buildReviewLink } from '$lib/server/reputation/reviewLink';
import { buildManageLink } from '$lib/server/tokens/appointmentManageToken';
import { emitReviewEvent, transitionToExpired } from '$lib/server/reputation/lifecycle';
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
		.where(
			and(eq(contacts.id, contactId), eq(contacts.org_id, orgId), isNull(contacts.deleted_at))
		);
	return contact ?? null;
}

async function insertAutomationJob(
	row: Omit<
		AutomationJob,
		| 'id'
		| 'created_at'
		| 'updated_at'
		| 'attempts'
		| 'last_error'
		| 'started_at'
		| 'completed_at'
		| 'failed_at'
	> & { bull_job_id: string }
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
		.where(
			inArray(
				automationJobs.id,
				pending.map((r) => r.id)
			)
		);
}

// ---- Handlers ----

async function handleSpeedToLead(data: EventJobData) {
	if (!data.org_id) return;
	const { org, settings } = await loadContext(data.org_id);
	if (!org || !settings || !settings.speed_to_lead_enabled) return;
	const contact = await loadContact(data.org_id, data.resource_id);
	if (!contact || contact.sms_opt_out) return;

	// Idempotency guard: one lead gets exactly one speed-to-lead text, ever. The
	// outbox redelivers at-least-once, so without this a re-dispatched
	// contact.created would queue another SMS each time. (This is the class of
	// bug that produced the runaway auto-reply loop.)
	const existing = await db
		.select({ id: automationJobs.id })
		.from(automationJobs)
		.where(
			and(
				eq(automationJobs.org_id, data.org_id),
				eq(automationJobs.type, 'speed_to_lead'),
				eq(automationJobs.resource_id, contact.id)
			)
		)
		.limit(1);
	if (existing.length > 0) return;

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
			const delta =
				(settings.quote_followup_delay_2_hours - settings.quote_followup_delay_1_hours) * 3600_000;
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
	const paymentLinkUrl = (data.payload.payment_link_url as string | null | undefined) ?? null;
	if (!contactId) return;

	const contact = await loadContact(orgId, contactId);
	if (!contact) return;

	if (rawToken) {
		const url = publicInvoiceUrl(rawToken);
		const dueLine = dueDate
			? ` Due ${new Date(dueDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}.`
			: '';

		if (!contact.sms_opt_out) {
			// Primary link first; fallback labeled explicitly so it's clearly secondary.
			const fallbackSms = paymentLinkUrl
				? `\nBackup payment link (original amount only): ${paymentLinkUrl}`
				: '';
			const smsBody = `Hi ${contact.full_name}, ${org.name} sent you invoice ${invoiceNumberDisplay} for ${totalFormatted}.${dueLine} Pay here: ${url}${fallbackSms}`;
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
				const fallbackEmail = paymentLinkUrl
					? `\n\nBackup payment link (use only if the link above is unavailable):
${paymentLinkUrl}
Note: this backup link charges the original invoice amount and does not reflect any later edits or partial payments. The link above always shows the current balance.`
					: '';
				const emailBody = `Hi ${contact.full_name},

${org.name} has sent you invoice ${invoiceNumberDisplay} for ${amountDueFormatted}.${dueDate ? `\n\nDue date: ${new Date(dueDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}` : ''}

View and pay your invoice:
${url}${fallbackEmail}`;
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

	// Pre-schedule the multi-step dunning cadence (Day 0/3/7/14 past due).
	// Cancelled in bulk by handleInvoicePaidCancel when the invoice is paid.
	await scheduleInvoiceDunning(orgId, data.resource_id, dueDate ?? null);
}

// Dunning cadence offsets in days, anchored to the invoice's due_date.
// Day 0 fires at the moment the invoice becomes overdue; subsequent steps
// escalate at 3, 7, and 14 days past due. If the invoice is sent past its
// due_date, earlier steps fire immediately (delay clamps to 0).
const DUNNING_STEP_DAYS = [0, 3, 7, 14] as const;

async function scheduleInvoiceDunning(
	orgId: string,
	invoiceId: string,
	dueDate: string | null | undefined
) {
	if (!dueDate) return;
	const { settings } = await loadContext(orgId);
	if (!settings || !settings.invoice_reminder_enabled) return;

	// Treat due_date as UTC midnight, matching the cron's CURRENT_DATE semantics.
	const dueAtMs = new Date(dueDate + 'T00:00:00Z').getTime();
	if (!Number.isFinite(dueAtMs)) return;
	const now = Date.now();

	// Clear any prior schedule for this invoice (e.g., a previous send before
	// the customer was re-invoiced). cancelPendingJobs removes BullMQ jobs and
	// marks the automation_jobs rows as 'cancelled'.
	await cancelPendingJobs(orgId, 'invoice_reminder', invoiceId);

	for (const day of DUNNING_STEP_DAYS) {
		const fireAtMs = dueAtMs + day * 86_400_000;
		const delay = Math.max(0, fireAtMs - now);
		const bullJobId = `invoice_reminder:${invoiceId}:day${day}`;
		try {
			const bullJob = await addJob(
				automationQueue(),
				'invoice_reminder',
				{
					outbox_event_id: bullJobId,
					event_type: 'invoice.dunning',
					org_id: orgId,
					resource_type: 'invoice',
					resource_id: invoiceId,
					payload: { dunning_day: day }
				},
				{ delay, jobId: bullJobId }
			);
			await insertAutomationJob({
				org_id: orgId,
				type: 'invoice_reminder',
				resource_type: 'invoice',
				resource_id: invoiceId,
				bull_job_id: String(bullJob.id),
				status: 'pending',
				scheduled_for: new Date(fireAtMs)
			});
		} catch (err) {
			console.error(
				`[automation] failed to schedule dunning day ${day} for invoice ${invoiceId}:`,
				err
			);
		}
	}
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

// ============================================================================
// Review lifecycle handlers — 5 jobs, all gated by feature_review_funnel.
//
// Topology (see outboxWorker.ts + .claude/skills/contractor-crm/references/09.reputation.md):
//   job.completed              → review.send       (delay = settings.review_funnel_delay_hours)
//   review_request.sent        → review.unengaged  (delay = 72h)
//                              → review.expire     (delay = 14d)
//   review_request.engaged     → review.nudge_1    (delay = 24h)
//                              → review.nudge_2    (delay = 72h)
//
// Attribution (Google review count reconcile) is NOT in this topology — it
// runs synchronously inside the reconcile endpoints via runAttribution().
//
// Every handler re-reads automation_settings + the row and exits if any guard
// fails. Pre-scheduling without runtime guards would double-send on retry.
// ============================================================================

// `job.completed` setup: schedule the eventual `review.send` after the
// contractor-configured delay (default 2h).
async function handleReviewSendSetup(data: EventJobData) {
	if (!data.org_id) return;
	const { settings } = await loadContext(data.org_id);
	if (!settings || !settings.review_funnel_enabled) return;
	const delayMs = settings.review_funnel_delay_hours * 3600_000;
	const bullJob = await addJob(
		automationQueue(),
		'review.send',
		{
			outbox_event_id: `review.send:${data.resource_id}`,
			event_type: 'review.send',
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

// `review.send`: create the review_request row in `sent` status, queue the SMS,
// emit `review_request.sent` so the outbox pre-schedules unengaged + expire.
async function handleReviewSend(job: Job, data: EventJobData) {
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
		const token = await generateReviewToken();
		const reviewLink = buildReviewLink(token);
		const now = new Date();

		const inserted = await db.transaction<{ id: string; token: string } | null>(async (tx) => {
			const [row] = await tx
				.insert(reviewRequests)
				.values({
					org_id: data.org_id!,
					job_id: data.resource_id,
					contact_id: contact.id,
					status: 'sent',
					sent_by_automation: true,
					sent_at: now,
					token,
					token_expires_at: reviewTokenExpiry()
				})
				.onConflictDoNothing({ target: reviewRequests.job_id })
				.returning({ id: reviewRequests.id, token: reviewRequests.token });
			if (!row || !row.token) return null;

			await emitReviewEvent(tx, {
				org_id: data.org_id!,
				review_request_id: row.id,
				type: 'sent'
			});

			// Pre-schedule the unengaged reminder (+72h) and the absolute expiry
			// (+14d) via the outbox. Both fire-time handlers re-read state.
			await tx.insert(outboxEvents).values({
				org_id: data.org_id!,
				event_type: 'review_request.sent',
				resource_type: 'review_request',
				resource_id: row.id,
				payload: {
					review_request_id: row.id,
					org_id: data.org_id!,
					job_id: data.resource_id,
					contact_id: contact.id
				},
				idempotency_key: `review_request.sent:${row.id}`
			});
			return { id: row.id, token: row.token };
		});

		// Conflict: a review request already exists for this job (manual send
		// or earlier worker run). Skip silently.
		if (!inserted) {
			if (automationJobRow) await markJobCompleted(automationJobRow.id);
			return;
		}

		const body = interpolate(settings.review_funnel_message, {
			contact_name: contact.full_name,
			org_name: org.name,
			review_link: reviewLink
		});
		await queueAutomationSms(db, {
			orgId: data.org_id,
			contactId: contact.id,
			body,
			source: 'automation.review.send'
		});
		if (automationJobRow) await markJobCompleted(automationJobRow.id);
	} catch (err) {
		if (automationJobRow) await markJobFailed(automationJobRow.id, err);
		throw err;
	}
}

// Shared loader: returns null and marks job complete if any precondition fails.
async function loadActiveReviewRequest(
	orgId: string,
	reviewRequestId: string,
	allowed: ReadonlyArray<'sent' | 'engaged'>
) {
	const [rr] = await db
		.select()
		.from(reviewRequests)
		.where(and(eq(reviewRequests.id, reviewRequestId), isNull(reviewRequests.deleted_at)));
	if (!rr || !rr.token) return null;
	if (!allowed.includes(rr.status as 'sent' | 'engaged')) return null;
	if (rr.org_id !== orgId) return null;
	return rr;
}

// `review.unengaged`: 72h after sent, if still `sent`, send the reminder copy.
async function handleReviewUnengaged(job: Job, data: EventJobData) {
	if (!data.org_id) return;
	const [automationJobRow] = await db
		.select()
		.from(automationJobs)
		.where(eq(automationJobs.bull_job_id, String(job.id)));
	if (automationJobRow && (await isJobCancelled(automationJobRow.id))) return;

	const reviewRequestId = (data.payload.review_request_id as string | undefined) ?? null;
	if (!reviewRequestId) {
		if (automationJobRow) await markJobCompleted(automationJobRow.id);
		return;
	}

	const rr = await loadActiveReviewRequest(data.org_id, reviewRequestId, ['sent']);
	const { org, settings } = await loadContext(data.org_id);
	if (
		!rr ||
		!org?.twilio_phone_number ||
		!settings?.review_funnel_enabled ||
		!settings.review_funnel_reminder_enabled
	) {
		if (automationJobRow) await markJobCompleted(automationJobRow.id);
		return;
	}

	const contact = await loadContact(data.org_id, rr.contact_id);
	if (!contact || contact.sms_opt_out) {
		if (automationJobRow) await markJobCompleted(automationJobRow.id);
		return;
	}

	if (automationJobRow) await markJobStarted(automationJobRow.id);
	try {
		const reviewLink = buildReviewLink(rr.token!);
		const body = interpolate(settings.review_funnel_reminder_message, {
			contact_name: contact.full_name,
			org_name: org.name,
			review_link: reviewLink
		});
		await db.transaction(async (tx) => {
			await queueAutomationSms(tx, {
				orgId: data.org_id!,
				contactId: contact.id,
				body,
				source: 'automation.review.unengaged'
			});
			await emitReviewEvent(tx, {
				org_id: data.org_id!,
				review_request_id: rr.id,
				type: 'reminder_sent'
			});
		});
		if (automationJobRow) await markJobCompleted(automationJobRow.id);
	} catch (err) {
		if (automationJobRow) await markJobFailed(automationJobRow.id, err);
		throw err;
	}
}

// Shared nudge handler. `expectedCount` is the value of `nudge_count` we
// require BEFORE this nudge fires; the UPDATE bumps it to expectedCount + 1.
// The `WHERE nudge_count = expectedCount` guard makes retries safe.
async function runNudge(
	job: Job,
	data: EventJobData,
	nudgeNumber: 1 | 2,
	expectedCount: 0 | 1,
	pickTemplate: (settings: {
		review_funnel_nudge_1_message: string;
		review_funnel_nudge_2_message: string;
	}) => string
) {
	if (!data.org_id) return;
	const [automationJobRow] = await db
		.select()
		.from(automationJobs)
		.where(eq(automationJobs.bull_job_id, String(job.id)));
	if (automationJobRow && (await isJobCancelled(automationJobRow.id))) return;

	const reviewRequestId = (data.payload.review_request_id as string | undefined) ?? null;
	if (!reviewRequestId) {
		if (automationJobRow) await markJobCompleted(automationJobRow.id);
		return;
	}

	const rr = await loadActiveReviewRequest(data.org_id, reviewRequestId, ['engaged']);
	const { org, settings } = await loadContext(data.org_id);
	if (
		!rr ||
		!org?.twilio_phone_number ||
		!settings?.review_funnel_enabled ||
		rr.nudge_count !== expectedCount
	) {
		if (automationJobRow) await markJobCompleted(automationJobRow.id);
		return;
	}

	const contact = await loadContact(data.org_id, rr.contact_id);
	if (!contact || contact.sms_opt_out) {
		if (automationJobRow) await markJobCompleted(automationJobRow.id);
		return;
	}

	if (automationJobRow) await markJobStarted(automationJobRow.id);
	try {
		const reviewLink = buildReviewLink(rr.token!);
		const body = interpolate(pickTemplate(settings), {
			contact_name: contact.full_name,
			org_name: org.name,
			review_link: reviewLink
		});

		// Atomic guard: only proceed if nudge_count is still at the expected
		// value. A concurrent retry trying to fire the same nudge gets 0 rows.
		const claimed = await db.transaction<boolean>(async (tx) => {
			const updated = await tx
				.update(reviewRequests)
				.set({ nudge_count: expectedCount + 1, updated_at: new Date() })
				.where(
					and(
						eq(reviewRequests.id, rr.id),
						eq(reviewRequests.status, 'engaged'),
						eq(reviewRequests.nudge_count, expectedCount)
					)
				)
				.returning({ id: reviewRequests.id });
			if (updated.length === 0) return false;

			await queueAutomationSms(tx, {
				orgId: data.org_id!,
				contactId: contact.id,
				body,
				source: `automation.review.nudge_${nudgeNumber}`
			});
			await emitReviewEvent(tx, {
				org_id: data.org_id!,
				review_request_id: rr.id,
				type: 'nudge_sent',
				nudge_number: nudgeNumber
			});
			return true;
		});

		if (!claimed) {
			if (automationJobRow) await markJobCompleted(automationJobRow.id);
			return;
		}
		if (automationJobRow) await markJobCompleted(automationJobRow.id);
	} catch (err) {
		if (automationJobRow) await markJobFailed(automationJobRow.id, err);
		throw err;
	}
}

async function handleReviewNudge1(job: Job, data: EventJobData) {
	return runNudge(job, data, 1, 0, (s) => s.review_funnel_nudge_1_message);
}

async function handleReviewNudge2(job: Job, data: EventJobData) {
	return runNudge(job, data, 2, 1, (s) => s.review_funnel_nudge_2_message);
}

// `review.expire`: 14d after sent, force-terminate any still-active row.
async function handleReviewExpire(job: Job, data: EventJobData) {
	if (!data.org_id) return;
	const [automationJobRow] = await db
		.select()
		.from(automationJobs)
		.where(eq(automationJobs.bull_job_id, String(job.id)));
	if (automationJobRow && (await isJobCancelled(automationJobRow.id))) return;

	const reviewRequestId = (data.payload.review_request_id as string | undefined) ?? null;
	if (!reviewRequestId) {
		if (automationJobRow) await markJobCompleted(automationJobRow.id);
		return;
	}

	if (automationJobRow) await markJobStarted(automationJobRow.id);
	try {
		await db.transaction(async (tx) => {
			await transitionToExpired(tx, reviewRequestId);
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

// Format a JS Date for the org's timezone using Intl. We intentionally split
// date + time so contractors can use {appointment_datetime}, {appointment_date},
// or {appointment_time} independently inside their templates.
function formatAppointmentForOrg(d: Date, timezone: string) {
	const datetime = new Intl.DateTimeFormat('en-US', {
		timeZone: timezone,
		weekday: 'short',
		month: 'short',
		day: 'numeric',
		hour: 'numeric',
		minute: '2-digit',
		timeZoneName: 'short'
	}).format(d);
	const date = new Intl.DateTimeFormat('en-US', {
		timeZone: timezone,
		weekday: 'long',
		month: 'long',
		day: 'numeric'
	}).format(d);
	const time = new Intl.DateTimeFormat('en-US', {
		timeZone: timezone,
		hour: 'numeric',
		minute: '2-digit',
		timeZoneName: 'short'
	}).format(d);
	return { datetime, date, time };
}

// Sent immediately when a customer self-books via a public booking link.
// Internal/staff-created appointments are intentionally skipped — the
// contractor already knows about those.
async function handleAppointmentConfirmation(data: EventJobData) {
	if (!data.org_id) return;
	const orgId = data.org_id;
	const appointmentId = data.resource_id;

	const [appointment] = await db
		.select()
		.from(appointments)
		.where(and(eq(appointments.id, appointmentId), isNull(appointments.deleted_at)));
	if (!appointment || appointment.status !== 'scheduled') return;
	if (appointment.booking_source !== 'booking_link') return;

	const { org, settings } = await loadContext(orgId);
	if (!org || !settings || !settings.appointment_confirmation_enabled) return;

	const contact = await loadContact(orgId, appointment.contact_id);
	if (!contact) return;

	const bullJobId = `appt_confirm:${appointmentId}`;
	const automationJob = await insertAutomationJob({
		org_id: orgId,
		type: 'appointment_confirmation',
		resource_type: 'appointment',
		resource_id: appointmentId,
		bull_job_id: bullJobId,
		status: 'processing',
		scheduled_for: new Date()
	});

	try {
		const formatted = formatAppointmentForOrg(appointment.scheduled_start, org.timezone);
		const apptType = appointment.type.replaceAll('_', ' ');
		const location = appointment.location ?? '';
		const locationBlock = location ? `Where: ${location}\n\n` : '';

		const templateVars = {
			contact_name: contact.full_name,
			org_name: org.name,
			appointment_datetime: formatted.datetime,
			appointment_date: formatted.date,
			appointment_time: formatted.time,
			appointment_type: apptType,
			location,
			location_block: locationBlock,
			manage_link: buildManageLink({
				appointmentId: appointment.id,
				updatedAt: appointment.updated_at,
				scheduledStart: appointment.scheduled_start
			})
		};

		// SMS — best-effort. Skip when contact opted out, has no phone, or org
		// has no Twilio number configured.
		if (contact.phone && !contact.sms_opt_out && org.twilio_phone_number) {
			try {
				const smsBody = interpolate(settings.appointment_confirmation_sms_message, templateVars);
				await queueAutomationSms(db, {
					orgId,
					contactId: contact.id,
					body: smsBody,
					source: 'automation.appointment_confirmation'
				});
			} catch (err) {
				console.error('[automation] appointment confirmation SMS failed:', err);
			}
		}

		// Email — also best-effort; the .ics attachment lives downstream in
		// emailWorker via the appointmentId carried on the outbox payload.
		if (contact.email) {
			try {
				const subject = interpolate(settings.appointment_confirmation_email_subject, templateVars);
				const body = interpolate(settings.appointment_confirmation_email_message, templateVars);
				await queueAutomationEmail(db, {
					orgId,
					contactId: contact.id,
					contactEmail: contact.email,
					subject,
					body,
					source: 'automation.appointment_confirmation',
					appointmentId
				});
			} catch (err) {
				console.error('[automation] appointment confirmation email failed:', err);
			}
		}

		await markJobCompleted(automationJob.id);
	} catch (err) {
		await markJobFailed(automationJob.id, err);
		throw err;
	}
}

async function handleAppointmentRescheduled(data: EventJobData) {
	if (!data.org_id) return;
	await cancelPendingJobs(data.org_id, 'appointment_reminder', data.resource_id);
	await handleAppointmentReminderSetup(data);
}

async function handleAppointmentReminder(job: Job, data: EventJobData, variant: '24h' | '1h') {
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
	await deactivateInvoicePaymentLink(data.org_id, data.resource_id);
}

// Disable the static Stripe Payment Link once the invoice is settled so a
// customer can't double-pay via the fallback link. Best-effort: a Stripe
// failure must not block the rest of the paid-event side effects.
async function deactivateInvoicePaymentLink(orgId: string, invoiceId: string) {
	try {
		const [row] = await db
			.select({
				stripe_payment_link_id: invoices.stripe_payment_link_id
			})
			.from(invoices)
			.where(and(eq(invoices.id, invoiceId), eq(invoices.org_id, orgId)))
			.limit(1);
		if (!row?.stripe_payment_link_id) return;

		const [orgRow] = await db
			.select({ stripe_restricted_key: organizations.stripe_restricted_key })
			.from(organizations)
			.where(eq(organizations.id, orgId))
			.limit(1);
		if (!orgRow?.stripe_restricted_key) return;

		const stripe = getOrgStripeClient(orgRow.stripe_restricted_key);
		await deactivatePaymentLink(stripe, row.stripe_payment_link_id);
	} catch (err) {
		console.error('[automation] Payment Link deactivation failed:', err);
	}
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
				return handleInvoiceReminder(job, data);
			case 'review.send':
				if (data.event_type === 'job.completed') return handleReviewSendSetup(data);
				return handleReviewSend(job, data);
			case 'review.unengaged':
				return handleReviewUnengaged(job, data);
			case 'review.nudge_1':
				return handleReviewNudge1(job, data);
			case 'review.nudge_2':
				return handleReviewNudge2(job, data);
			case 'review.expire':
				return handleReviewExpire(job, data);
			case 'appointment_reminder':
				return handleAppointmentReminderSetup(data);
			case 'appointment_confirmation':
				return handleAppointmentConfirmation(data);
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
