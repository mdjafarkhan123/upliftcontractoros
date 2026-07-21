import { Worker, type Job } from 'bullmq';
import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import {
	appointments,
	automationJobs,
	automationSettings,
	contacts,
	invoices,
	jobs,
	opportunities,
	organizations,
	outboxEvents,
	pipelineStages,
	quotes,
	reviewRequests,
	type AutomationJob
} from '$lib/server/db/schema';
import { markOpportunityWon, markOpportunityLost } from '$lib/server/pipeline/transitions';
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
import {
	enroll,
	advanceEnrollment,
	resumeEnrollment,
	pauseEnrollmentsForLeadReply,
	stopEnrollmentsForContact,
	stopEnrollmentsForResource,
	reanchorEnrollments
} from '$lib/server/automation/engine';
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

// ---- Handlers ----

// Speed-to-Lead now runs on the sequence engine (Stage 3.b). `lead.created`
// enrolls the contact into the org's `speed_to_lead` sequence; the engine sends
// the instant reply (step 0) and drives the follow-up steps, channel fallback,
// quiet hours, and stop/pause conditions. The enrollment's partial-unique index
// is the idempotency guard (one non-terminal enrollment per contact+sequence).
async function handleSpeedToLeadEnroll(data: EventJobData) {
	if (!data.org_id) return;
	const contactId = (data.payload.contact_id as string | undefined) ?? data.resource_id;
	if (!contactId) return;
	await enroll({
		orgId: data.org_id,
		sequenceKey: 'speed_to_lead',
		contactId,
		resourceType: 'contact',
		resourceId: contactId
	});
}

// ---- Engine lifecycle hooks (Stage 3.b) ----

// Lead replied (inbound message.received) → pause active sequences for the
// contact and auto-resume in 2h if no staff reply intervenes.
async function handleEngineLeadReply(data: EventJobData) {
	if (!data.org_id) return;
	const contactId = data.payload.contact_id as string | undefined;
	if (!contactId) return;
	await pauseEnrollmentsForLeadReply(data.org_id, contactId);
}

// Staff sent a message (message.sent with a member sent_by) → stop the
// sequence. Automation sends carry sent_by=null and are ignored here.
async function handleEngineStaffReply(data: EventJobData) {
	if (!data.org_id) return;
	const sentBy = data.payload.sent_by as string | null | undefined;
	if (!sentBy) return;
	const contactId = data.payload.contact_id as string | undefined;
	if (!contactId) return;
	// Appointment reminders are exempt — a staff reply must not cancel a customer's
	// upcoming visit reminder. They stop only on the appointment's own lifecycle.
	await stopEnrollmentsForContact(data.org_id, contactId, 'staff_reply', ['appointment']);
}

// Staff logged a call with outcome=spoke → stop the sequence.
async function handleEngineCallSpoke(data: EventJobData) {
	if (!data.org_id) return;
	const contactId = data.payload.contact_id as string | undefined;
	if (!contactId) return;
	await stopEnrollmentsForContact(data.org_id, contactId, 'call_spoke', ['appointment']);
}

// Opportunity marked won/lost → stop the sequence.
async function handleEngineOppClosed(data: EventJobData, reason: 'won' | 'lost') {
	if (!data.org_id) return;
	const contactId = data.payload.contact_id as string | undefined;
	if (!contactId) return;
	await stopEnrollmentsForContact(data.org_id, contactId, reason, ['appointment']);
}

// Missed-call text-back now runs on the sequence engine (Stage 3.c.1). `call.missed`
// enrolls the contact into the org's `missed_call` sequence; the engine sends the
// instant text-back (step 0) and drives the SMS-only follow-up steps, quiet hours,
// and the shared pause/stop conditions (lead reply, staff reply, call=spoke,
// won/lost, opt-out). The enrollment's partial-unique index is the idempotency
// guard. The instant reply still lands in the contact's open conversation — which
// is the missed-call thread — via findOrCreateOpenConversation in the SMS pipeline.
// The org master SMS gate is enforced inside the engine's channel resolution
// (sms_only step + smsCapable check), so no separate gate is needed here.
async function handleMissedCallTextbackEnroll(data: EventJobData) {
	if (!data.org_id) return;
	const contactId = data.payload.contact_id as string | undefined;
	if (!contactId) return;
	await enroll({
		orgId: data.org_id,
		sequenceKey: 'missed_call',
		contactId,
		resourceType: 'contact',
		resourceId: contactId
	});
}

// ---- Pipeline auto-create + ratchet auto-advance (Stage 3.a) ----

// `lead.created` → create a pipeline deal in the org's default (entry) stage,
// unless the org disabled it or the contact already has a deal. Mirrors the
// manual POST /api/pipeline/opportunities path (same opportunity.created event).
async function handlePipelineAutoCreate(data: EventJobData) {
	if (!data.org_id) return;
	const orgId = data.org_id;
	const contactId = (data.payload.contact_id as string | undefined) ?? data.resource_id;
	if (!contactId) return;

	const { settings } = await loadContext(orgId);
	if (!settings || !settings.auto_create_opp_on_lead) return;

	const contact = await loadContact(orgId, contactId);
	if (!contact) return;

	// Dedup: a brand-new lead shouldn't have a deal yet, but guard against a manual
	// create racing the inbound capture — skip if any non-deleted deal exists.
	const existing = await db
		.select({ id: opportunities.id })
		.from(opportunities)
		.where(
			and(
				eq(opportunities.org_id, orgId),
				eq(opportunities.contact_id, contactId),
				isNull(opportunities.deleted_at)
			)
		)
		.limit(1);
	if (existing.length > 0) return;

	// Entry stage = the org's default stage (same resolution as manual create).
	const [defaultStage] = await db
		.select({
			id: pipelineStages.id,
			default_follow_up_days: pipelineStages.default_follow_up_days
		})
		.from(pipelineStages)
		.where(
			and(
				eq(pipelineStages.org_id, orgId),
				eq(pipelineStages.is_default, true),
				isNull(pipelineStages.deleted_at)
			)
		)
		.orderBy(asc(pipelineStages.position))
		.limit(1);
	if (!defaultStage) {
		console.warn(`[automation] pipeline_auto_create: no default stage for org ${orgId}`);
		return;
	}

	const autoFollowUpAt =
		defaultStage.default_follow_up_days !== null
			? new Date(Date.now() + defaultStage.default_follow_up_days * 86_400_000)
			: null;

	await db.transaction(async (tx) => {
		// Re-check inside the tx to close the race with a concurrent manual create.
		const [dupe] = await tx
			.select({ id: opportunities.id })
			.from(opportunities)
			.where(
				and(
					eq(opportunities.org_id, orgId),
					eq(opportunities.contact_id, contactId),
					isNull(opportunities.deleted_at)
				)
			)
			.limit(1);
		if (dupe) return;

		const [inserted] = await tx
			.insert(opportunities)
			.values({
				org_id: orgId,
				contact_id: contactId,
				stage_id: defaultStage.id,
				title: contact.full_name,
				next_follow_up_at: autoFollowUpAt
			})
			.returning();

		await tx.insert(outboxEvents).values({
			org_id: orgId,
			event_type: 'opportunity.created',
			resource_type: 'opportunity',
			resource_id: inserted.id,
			payload: {
				event_version: 1,
				opportunity_id: inserted.id,
				org_id: orgId,
				contact_id: inserted.contact_id,
				stage_id: inserted.stage_id,
				title: inserted.title,
				value: inserted.value,
				assigned_to: inserted.assigned_to,
				source: 'auto_lead_capture'
			},
			idempotency_key: `opportunity.created:${inserted.id}`
		});
	});
}

// Pipeline ratchet — "the board reflects work done, not a to-do list."
// Each milestone advances a contact's open deal to a SPECIFIC column (by
// position, since stages are org-configurable), never backward and never past a
// column a human already set. Forward-only is enforced by a conditional UPDATE
// that only matches deals still sitting in an EARLIER column. Runs on every
// triggering event, so it exits fast when there's nothing to advance.
//
//   pos 1 (Contacted) ← first HUMAN outbound: staff SMS/email, or a `spoke` call
//   pos 2 (Scheduled) ← an appointment lands on the calendar
//   pos 3 (Quoted)    ← the first quote is sent
const ADVANCE_TARGET_POSITION: Record<string, number> = {
	'message.sent': 1,
	'call.logged': 1,
	'appointment.created': 2,
	'appointment.booked': 2,
	'quote.sent': 3
};

const ADVANCE_SOURCE: Record<number, string> = {
	1: 'auto_contacted',
	2: 'auto_scheduled',
	3: 'auto_quoted'
};

async function handlePipelineAutoAdvance(data: EventJobData) {
	if (!data.org_id) return;
	const orgId = data.org_id;

	const targetPosition = ADVANCE_TARGET_POSITION[data.event_type];
	if (targetPosition === undefined) return;

	// An outbound message only counts as "Contacted" when a HUMAN sent it.
	// Automation sends carry sent_by=null and must never advance the pipeline.
	if (data.event_type === 'message.sent' && data.payload.sent_by == null) return;

	const contactId = (data.payload.contact_id as string | undefined) ?? data.resource_id;
	if (!contactId) return;

	// Active stages in board order.
	const stages = await db
		.select({
			id: pipelineStages.id,
			name: pipelineStages.name,
			position: pipelineStages.position,
			default_follow_up_days: pipelineStages.default_follow_up_days
		})
		.from(pipelineStages)
		.where(and(eq(pipelineStages.org_id, orgId), isNull(pipelineStages.deleted_at)))
		.orderBy(asc(pipelineStages.position));
	if (stages.length < 2) return;

	// Clamp the target to the last column for orgs with fewer stages than the
	// canonical New Lead/Contacted/Scheduled/Quoted layout.
	const targetIdx = Math.min(targetPosition, stages.length - 1);
	const targetStage = stages[targetIdx];
	// The only columns we ratchet FROM — anything strictly before the target.
	const earlierStageIds = stages.slice(0, targetIdx).map((s) => s.id);
	if (earlierStageIds.length === 0) return; // target is the entry column — nothing earlier

	// The contact's OPEN deal currently sitting in an earlier column.
	const [deal] = await db
		.select({
			id: opportunities.id,
			stage_id: opportunities.stage_id,
			next_follow_up_at: opportunities.next_follow_up_at
		})
		.from(opportunities)
		.where(
			and(
				eq(opportunities.org_id, orgId),
				eq(opportunities.contact_id, contactId),
				eq(opportunities.status, 'open'),
				inArray(opportunities.stage_id, earlierStageIds),
				isNull(opportunities.deleted_at)
			)
		)
		.orderBy(asc(opportunities.created_at))
		.limit(1);
	if (!deal) return;

	const fromStage = stages.find((s) => s.id === deal.stage_id) ?? null;
	const source = ADVANCE_SOURCE[targetIdx] ?? `auto_position_${targetIdx}`;

	const autoFollowUpAt =
		targetStage.default_follow_up_days !== null && deal.next_follow_up_at === null
			? new Date(Date.now() + targetStage.default_follow_up_days * 86_400_000)
			: undefined;

	await db.transaction(async (tx) => {
		const now = new Date();
		const stageSet: Record<string, unknown> = {
			stage_id: targetStage.id,
			stage_entered_at: now,
			updated_at: now
		};
		if (autoFollowUpAt !== undefined) stageSet.next_follow_up_at = autoFollowUpAt;

		// Conditional ratchet: advance only if still open AND still in an earlier
		// column. A concurrent move/manual advance gets 0 rows and no-ops.
		const [updated] = await tx
			.update(opportunities)
			.set(stageSet)
			.where(
				and(
					eq(opportunities.id, deal.id),
					inArray(opportunities.stage_id, earlierStageIds),
					eq(opportunities.status, 'open')
				)
			)
			.returning();
		if (!updated) return;

		await tx.insert(outboxEvents).values({
			org_id: orgId,
			event_type: 'opportunity.stage_changed',
			resource_type: 'opportunity',
			resource_id: updated.id,
			payload: {
				event_version: 1,
				opportunity_id: updated.id,
				org_id: orgId,
				contact_id: updated.contact_id,
				assigned_to: updated.assigned_to ?? null,
				from_stage_id: fromStage?.id ?? null,
				to_stage_id: targetStage.id,
				from_stage_name: fromStage?.name ?? null,
				to_stage_name: targetStage.name,
				source
			},
			idempotency_key: `opportunity.stage_changed:${source}:${updated.id}`
		});
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
	// Contractor-chosen channels + custom copy (Session D). Null channels = legacy
	// default (deliver on every available channel). Null body = default copy.
	const channels = (data.payload.channels as ('email' | 'sms')[] | null | undefined) ?? null;
	const customSms = (data.payload.sms_body as string | null | undefined) ?? null;
	const customEmailSubject = (data.payload.email_subject as string | null | undefined) ?? null;
	const customEmailBody = (data.payload.email_body as string | null | undefined) ?? null;
	if (!contactId || !rawToken) return;

	const contact = await loadContact(orgId, contactId);
	if (!contact) return;

	const url = publicQuoteUrl(rawToken);
	const wantSms = channels ? channels.includes('sms') : true;
	const wantEmail = channels ? channels.includes('email') : true;

	// Merge values for any custom copy the contractor wrote.
	const vars = {
		contact_name: contact.full_name,
		org_name: org.name,
		quote_number: quoteNumberDisplay,
		quote_amount: totalFormatted,
		amount: totalFormatted,
		quote_link: url
	};
	// The public link must always survive, even if a custom message drops the token.
	const ensureLink = (text: string) => (text.includes(url) ? text : `${text}\n\n${url}`);

	if (wantSms && !contact.sms_opt_out) {
		const verb = isResend ? 'updated your quote' : 'sent you a quote';
		const defaultBody = `Hi ${contact.full_name}, ${org.name} ${verb} (${quoteNumberDisplay}, ${totalFormatted}). View it here: ${url}`;
		const body = ensureLink(customSms ? interpolate(customSms, vars) : defaultBody);
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

	if (wantEmail && hasEmail && contact.email) {
		try {
			const verb = isResend ? 'updated your quote' : 'sent you a quote';
			const subject = customEmailSubject
				? interpolate(customEmailSubject, vars)
				: isResend
					? `Updated quote ${quoteNumberDisplay} from ${org.name}`
					: `Your quote ${quoteNumberDisplay} from ${org.name}`;
			const defaultBody = `Hi ${contact.full_name},

${org.name} has ${verb} (${quoteNumberDisplay}, ${totalFormatted}).

View your quote:
${url}`;
			const body = ensureLink(customEmailBody ? interpolate(customEmailBody, vars) : defaultBody);
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

// Quote send (event quote.sent). Always dispatches the actual quote (transactional
// delivery — not gated by the follow-up card), then enrolls the quote into the
// engine-driven follow-up sequence (Stage 3.c.2). The sequence's own `enabled`
// flag + steps drive cadence/copy; stop happens on accept/decline/view/won/lost.
async function handleQuoteFollowupSetup(data: EventJobData) {
	if (!data.org_id) return;
	const contactId = data.payload.contact_id as string | undefined;

	// Resends: stop any live follow-up enrollment for this quote before re-enrolling
	// (the active-enrollment unique index would otherwise block the new one).
	if (data.payload.is_resend) {
		await stopEnrollmentsForResource(data.org_id, 'quote', data.resource_id, 'quote_resent');
	}
	// Send initial SMS/email synchronously (internal try/catch — failures must not
	// block enrollment).
	await dispatchInitialQuote(data);

	if (!contactId) return;
	await enroll({
		orgId: data.org_id,
		sequenceKey: 'quote_followup',
		contactId,
		resourceType: 'quote',
		resourceId: data.resource_id
	});
}

async function handleInvoiceDispatch(data: EventJobData) {
	if (!data.org_id) return;
	const orgId = data.org_id;
	const { org } = await loadContext(orgId);
	if (!org) return;

	// Re-check the invoice's live status at send time. A backlog drain can run this
	// long after the event was queued; if the invoice was cancelled or deleted in the
	// meantime, do NOT send the "here's your invoice" email/SMS or enroll dunning.
	const [invRow] = await db
		.select({ status: invoices.status, deleted_at: invoices.deleted_at })
		.from(invoices)
		.where(and(eq(invoices.id, data.resource_id), eq(invoices.org_id, orgId)))
		.limit(1);
	if (!invRow || invRow.deleted_at || invRow.status === 'cancelled') return;

	const contactId = data.payload.contact_id as string | undefined;
	const rawToken = data.payload.public_token as string | undefined;
	const totalFormatted = (data.payload.total_formatted as string | undefined) ?? '';
	const amountDueFormatted = (data.payload.amount_due_formatted as string | undefined) ?? '';
	const invoiceNumberDisplay = (data.payload.invoice_number_display as string | undefined) ?? '';
	const hasEmail = Boolean(data.payload.has_email);
	const dueDate = data.payload.due_date as string | null | undefined;
	const paymentLinkUrl = (data.payload.payment_link_url as string | null | undefined) ?? null;
	// Contractor-chosen channels + custom copy. Null channels = legacy default (deliver on
	// every available channel). Null body = built-in default copy.
	const channels = (data.payload.channels as ('email' | 'sms')[] | null | undefined) ?? null;
	const customSms = (data.payload.sms_body as string | null | undefined) ?? null;
	const customEmailSubject = (data.payload.email_subject as string | null | undefined) ?? null;
	const customEmailBody = (data.payload.email_body as string | null | undefined) ?? null;
	if (!contactId) return;

	const contact = await loadContact(orgId, contactId);
	if (!contact) return;

	if (rawToken) {
		const url = publicInvoiceUrl(rawToken);
		const dueLine = dueDate
			? ` Due ${new Date(dueDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}.`
			: '';
		const wantSms = channels ? channels.includes('sms') : true;
		const wantEmail = channels ? channels.includes('email') : true;

		// Merge values for any custom copy the contractor wrote.
		const vars = {
			contact_name: contact.full_name,
			org_name: org.name,
			invoice_number: invoiceNumberDisplay,
			invoice_amount: amountDueFormatted,
			amount: amountDueFormatted,
			invoice_link: url
		};
		// The public link must always survive, even if a custom message drops the token.
		const ensureLink = (text: string) => (text.includes(url) ? text : `${text}\n\n${url}`);

		if (wantSms && !contact.sms_opt_out) {
			// Primary link first; the Stripe fallback link is always appended, labeled as secondary.
			const fallbackSms = paymentLinkUrl
				? `\nBackup payment link (original amount only): ${paymentLinkUrl}`
				: '';
			const defaultBody = `Hi ${contact.full_name}, ${org.name} sent you invoice ${invoiceNumberDisplay} for ${totalFormatted}.${dueLine} Pay here: ${url}`;
			const base = customSms ? ensureLink(interpolate(customSms, vars)) : defaultBody;
			const smsBody = `${base}${fallbackSms}`;
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

		if (wantEmail && hasEmail && contact.email) {
			try {
				const fallbackEmail = paymentLinkUrl
					? `\n\nBackup payment link (use only if the link above is unavailable):
${paymentLinkUrl}
Note: this backup link charges the original invoice amount and does not reflect any later edits or partial payments. The link above always shows the current balance.`
					: '';
				const subject = customEmailSubject
					? interpolate(customEmailSubject, vars)
					: `Invoice ${invoiceNumberDisplay} from ${org.name}`;
				const defaultBody = `Hi ${contact.full_name},

${org.name} has sent you invoice ${invoiceNumberDisplay} for ${amountDueFormatted}.${dueDate ? `\n\nDue date: ${new Date(dueDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}` : ''}

View and pay your invoice:
${url}`;
				const base = customEmailBody ? ensureLink(interpolate(customEmailBody, vars)) : defaultBody;
				const emailBody = `${base}${fallbackEmail}`;
				await queueAutomationEmail(db, {
					orgId,
					contactId: contact.id,
					contactEmail: contact.email,
					subject,
					body: emailBody,
					source: 'automation.invoice_initial'
				});
			} catch (err) {
				console.error('[automation] invoice email dispatch failed:', err);
			}
		}
	}

	// Enroll the invoice into the engine-driven dunning sequence (Stage 3.c.2),
	// anchored to the due_date so steps fire at due_date + step delays. The
	// per-invoice `send_payment_reminders` opt-out + org feature gate are both
	// enforced inside the helper.
	await maybeEnrollInvoiceDunning(orgId, data.resource_id, contactId, dueDate ?? null);
}

// Shared invoice-dunning enrollment (used by invoice.sent dispatch AND the
// per-invoice reminders toggle). Enrolls the invoice into the invoice_dunning
// sequence anchored to its due_date. No-ops when: no due date (matches prior
// behaviour), no contact, the invoice has reminders switched off
// (send_payment_reminders = false — the per-invoice opt-out), or the org feature
// gate is off. invoice_dispatch is ungated (it also sends the actual invoice), so
// the dunning feature gate must be applied here at enrollment time, mirroring how
// quote_followup's entry job carries feature_quote_followup. enroll() is
// idempotent (active-enrollment unique index), so a redelivered toggle can't
// double-enroll.
async function maybeEnrollInvoiceDunning(
	orgId: string,
	invoiceId: string,
	contactId: string | undefined,
	dueDate: string | null
): Promise<void> {
	if (!dueDate || !contactId) return;

	const [inv] = await db
		.select({ send_payment_reminders: invoices.send_payment_reminders })
		.from(invoices)
		.where(and(eq(invoices.id, invoiceId), eq(invoices.org_id, orgId)))
		.limit(1);
	if (!inv || !inv.send_payment_reminders) return;

	if (!(await isFeatureEnabled(orgId, 'feature_invoice_reminders'))) return;

	// Treat due_date as UTC midnight, matching the overdue cron's semantics.
	const anchor = new Date(dueDate + 'T00:00:00Z');
	if (!Number.isFinite(anchor.getTime())) return;

	await enroll({
		orgId,
		sequenceKey: 'invoice_dunning',
		contactId,
		resourceType: 'invoice',
		resourceId: invoiceId,
		anchorAt: anchor
	});
}

// Per-invoice reminders toggle (invoice.reminders_toggled — emitted by the
// /reminders endpoint only for already-sent invoices). enabled=true re-enrolls
// the invoice into dunning (respecting the same gates as dispatch); enabled=false
// stops any pending reminders for this invoice. Drafts never emit this event —
// their flag is read fresh at invoice.sent time.
async function handleInvoiceRemindersToggle(data: EventJobData) {
	if (!data.org_id) return;
	const orgId = data.org_id;
	const enabled = Boolean(data.payload.enabled);
	const contactId = data.payload.contact_id as string | undefined;
	const dueDate = (data.payload.due_date as string | null | undefined) ?? null;

	if (enabled) {
		await maybeEnrollInvoiceDunning(orgId, data.resource_id, contactId, dueDate);
	} else {
		await stopEnrollmentsForResource(orgId, 'invoice', data.resource_id, 'reminders_disabled');
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

// Appointment reminders now run on the sequence engine (Stage 3.c.3). The
// `appointment_reminder` sequence is anchored to the appointment's
// scheduled_start; its steps carry NEGATIVE offset_minutes (-1440 = 24h before,
// -60 = 1h before), so the engine schedules each reminder relative to the visit
// and skips any window already past (short-notice bookings). Reschedule
// re-anchors (handleAppointmentRescheduled); cancel/complete/no_show stops it
// (handleAppointmentCancelReminders). The `feature_appointment_reminders` gate is
// applied at the worker dispatcher; the sequence's own `enabled` flag (seeded
// from appointment_reminder_enabled) is the on/off switch.
async function enrollAppointmentReminder(
	orgId: string,
	appt: { id: string; contact_id: string; scheduled_start: Date | null }
) {
	// Defensive: an unscheduled visit (no date) has nothing to anchor a reminder to. Callers
	// already gate on this, but guarding here keeps the anchor type sound.
	if (appt.scheduled_start === null) return;
	await enroll({
		orgId,
		sequenceKey: 'appointment_reminder',
		contactId: appt.contact_id,
		resourceType: 'appointment',
		resourceId: appt.id,
		anchorAt: appt.scheduled_start
	});
}

async function handleAppointmentReminderSetup(data: EventJobData) {
	if (!data.org_id) return;
	const [appointment] = await db
		.select()
		.from(appointments)
		.where(and(eq(appointments.id, data.resource_id), isNull(appointments.deleted_at)));
	if (!appointment || appointment.status !== 'scheduled') return;
	// Unscheduled visits have no date, and "Anytime" visits no clock time — nothing to
	// remind 24h/1h before in either case.
	if (appointment.scheduled_start === null || appointment.all_day) return;
	await enrollAppointmentReminder(data.org_id, appointment);
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
	// A dateless (unscheduled) visit can't be confirmed to a time — skip.
	if (appointment.scheduled_start === null) return;

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

// Client-facing "your job is booked" confirmation. Fires when the contractor picked a
// channel on the job form. Copy comes from the org's job_scheduled template, but the form
// may attach a per-job override (sms_message/email_subject/email_message) for one-off
// wording — when present it wins over the template; both still run through interpolate()
// for merge tokens. A master enable gate in Settings can switch all of these off.
// Best-effort per channel: a single-channel failure never fails the other.
async function handleJobScheduledConfirmation(data: EventJobData) {
	if (!data.org_id) return;
	const orgId = data.org_id;
	const jobId = data.resource_id;
	const channel = (data.payload.channel as 'sms' | 'email' | 'both' | undefined) ?? 'both';
	const customSms = (data.payload.sms_message as string | null | undefined) ?? null;
	const customSubject = (data.payload.email_subject as string | null | undefined) ?? null;
	const customBody = (data.payload.email_message as string | null | undefined) ?? null;

	const [jobRow] = await db
		.select()
		.from(jobs)
		.where(and(eq(jobs.id, jobId), eq(jobs.org_id, orgId), isNull(jobs.deleted_at)));
	// Only send schedule confirmations for open jobs — a closed (archived) job never needs one.
	if (!jobRow || !jobRow.scheduled_start || jobRow.status !== 'active') return;

	const { org, settings } = await loadContext(orgId);
	if (!org || !settings) return;

	// Master gate on top of the per-job channel pick. Default-on; lets a contractor
	// globally switch off customer job confirmations from Settings → Automation.
	if (!settings.job_scheduled_confirmation_enabled) return;

	const contact = await loadContact(orgId, jobRow.contact_id);
	if (!contact) return;

	const formatted = formatAppointmentForOrg(jobRow.scheduled_start, org.timezone);
	const templateVars = {
		contact_name: contact.full_name,
		org_name: org.name,
		job_title: jobRow.title,
		scheduled_datetime: formatted.datetime
	};
	const wantsSms = channel === 'sms' || channel === 'both';
	const wantsEmail = channel === 'email' || channel === 'both';

	// SMS — best-effort. Skip when opted out, no phone, or org has no Twilio number.
	if (wantsSms && contact.phone && !contact.sms_opt_out && org.twilio_phone_number) {
		try {
			const smsBody = interpolate(customSms ?? settings.job_scheduled_sms_message, templateVars);
			await queueAutomationSms(db, {
				orgId,
				contactId: contact.id,
				body: smsBody,
				source: 'automation.job_scheduled_confirmation'
			});
		} catch (err) {
			console.error('[automation] job scheduled confirmation SMS failed:', err);
		}
	}

	// Email — also best-effort.
	if (wantsEmail && contact.email) {
		try {
			const subject = interpolate(
				customSubject ?? settings.job_scheduled_email_subject,
				templateVars
			);
			const emailBody = interpolate(
				customBody ?? settings.job_scheduled_email_message,
				templateVars
			);
			await queueAutomationEmail(db, {
				orgId,
				contactId: contact.id,
				contactEmail: contact.email,
				subject,
				body: emailBody,
				source: 'automation.job_scheduled_confirmation'
			});
		} catch (err) {
			console.error('[automation] job scheduled confirmation email failed:', err);
		}
	}
}

// Client-facing reschedule confirmation. Fires only when the contractor opted to
// notify on the drag-confirm popover (the PATCH handler emits the event with a
// channel). Reuses the org's appointment_confirmation_* templates for copy — the
// wording ("here's your appointment time") fits a reschedule, so no separate
// template is needed (mirrors how jobs reuse job_scheduled_* on reschedule). The
// per-reschedule channel pick IS the on/off switch, so this is intentionally NOT
// gated on appointment_confirmation_enabled (that toggle governs the booking-link
// self-book auto-confirmation, a different trigger). Best-effort per channel.
async function handleAppointmentRescheduleConfirmation(data: EventJobData) {
	if (!data.org_id) return;
	const orgId = data.org_id;
	const appointmentId = data.resource_id;
	const channel = (data.payload.channel as 'sms' | 'email' | 'both' | undefined) ?? 'both';
	// Per-reschedule copy overrides edited in the notify dialog (null = use org template).
	const customSms = (data.payload.sms_message as string | null | undefined) ?? null;
	const customSubject = (data.payload.email_subject as string | null | undefined) ?? null;
	const customBody = (data.payload.email_message as string | null | undefined) ?? null;

	const [appointment] = await db
		.select()
		.from(appointments)
		.where(and(eq(appointments.id, appointmentId), isNull(appointments.deleted_at)));
	if (!appointment || appointment.status !== 'scheduled') return;
	// A dateless (unscheduled) visit can't be confirmed to a time — skip.
	if (appointment.scheduled_start === null) return;

	const { org, settings } = await loadContext(orgId);
	if (!org || !settings) return;

	const contact = await loadContact(orgId, appointment.contact_id);
	if (!contact) return;

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
	const wantsSms = channel === 'sms' || channel === 'both';
	const wantsEmail = channel === 'email' || channel === 'both';

	// SMS — best-effort. Skip when opted out, no phone, or org has no Twilio number.
	if (wantsSms && contact.phone && !contact.sms_opt_out && org.twilio_phone_number) {
		try {
			const smsBody = interpolate(
				customSms ?? settings.appointment_confirmation_sms_message,
				templateVars
			);
			await queueAutomationSms(db, {
				orgId,
				contactId: contact.id,
				body: smsBody,
				source: 'automation.appointment_reschedule_confirmation'
			});
		} catch (err) {
			console.error('[automation] appointment reschedule confirmation SMS failed:', err);
		}
	}

	// Email — also best-effort; .ics attachment is added downstream via appointmentId.
	if (wantsEmail && contact.email) {
		try {
			const subject = interpolate(
				customSubject ?? settings.appointment_confirmation_email_subject,
				templateVars
			);
			const body = interpolate(
				customBody ?? settings.appointment_confirmation_email_message,
				templateVars
			);
			await queueAutomationEmail(db, {
				orgId,
				contactId: contact.id,
				contactEmail: contact.email,
				subject,
				body,
				source: 'automation.appointment_reschedule_confirmation',
				appointmentId
			});
		} catch (err) {
			console.error('[automation] appointment reschedule confirmation email failed:', err);
		}
	}
}

// Reschedule → re-anchor the live reminder enrollment to the new scheduled_start
// (preserving already-sent steps so a later move never resends the 24h reminder).
// If no active enrollment exists (booked while the feature was off, or its
// reminders already completed before the move), set up a fresh one — matching the
// old "always have reminders after a reschedule" behaviour. A reschedule that also
// closed the appointment stops the sequence.
async function handleAppointmentRescheduled(data: EventJobData) {
	if (!data.org_id) return;
	const [appointment] = await db
		.select()
		.from(appointments)
		.where(and(eq(appointments.id, data.resource_id), isNull(appointments.deleted_at)));
	if (!appointment) return;
	if (appointment.status !== 'scheduled') {
		await stopEnrollmentsForResource(
			data.org_id,
			'appointment',
			data.resource_id,
			'appointment_rescheduled_closed'
		);
		return;
	}
	// A 'scheduled' visit always has a date; this guard just narrows the nullable column
	// (an unscheduled visit would already have returned at the status check above).
	if (appointment.scheduled_start === null) return;
	// Toggled to an "Anytime" visit (no clock time): stop any live timed reminder and
	// don't re-anchor — there's no time to remind before.
	if (appointment.all_day) {
		await stopEnrollmentsForResource(
			data.org_id,
			'appointment',
			data.resource_id,
			'appointment_became_anytime'
		);
		return;
	}
	const touched = await reanchorEnrollments(
		data.org_id,
		'appointment',
		data.resource_id,
		appointment.scheduled_start
	);
	if (touched === 0) await enrollAppointmentReminder(data.org_id, appointment);
}

// completed / cancelled / no_show → stop the reminder sequence. Ungated so a stop
// always lands even if the feature was later disabled. (The engine's fire-time
// appointment guard also stops a non-scheduled appointment, but stopping here
// proactively frees the pending BullMQ job.)
const APPOINTMENT_CLOSE_REASON: Record<string, string> = {
	'appointment.completed': 'appointment_completed',
	'appointment.cancelled': 'appointment_cancelled',
	'appointment.no_show': 'appointment_no_show'
};

async function handleAppointmentCancelReminders(data: EventJobData) {
	if (!data.org_id) return;
	const reason = APPOINTMENT_CLOSE_REASON[data.event_type] ?? 'appointment_closed';
	await stopEnrollmentsForResource(data.org_id, 'appointment', data.resource_id, reason);
}

// Stage 3.c.3b — no-show re-engagement. A customer SMS nurture enrolled when staff
// mark an appointment no_show. Contact-anchored (mechanically identical to
// missed_call): fires immediately + follow-ups, and pauses/stops on the normal
// nurture signals (lead reply, staff reply, call=spoke, won/lost, opt-out). The
// sequence's `enabled` flag (seeded off) is the on/off switch.
async function handleAppointmentNoShowFollowup(data: EventJobData) {
	if (!data.org_id) return;
	const contactId = data.payload.contact_id as string | undefined;
	if (!contactId) return;
	await enroll({
		orgId: data.org_id,
		sequenceKey: 'appointment_no_show',
		contactId,
		resourceType: 'contact',
		resourceId: contactId
	});
}

// Stage 3.c.3b — post-appointment "no quote sent" STAFF nudge. Enrolled when an
// appointment is marked completed; a single offset step fires a few hours after the
// slot and (via the no_quote_since_anchor condition) only alerts the office/crew when
// no quote was raised for the contact since the visit. Appointment-anchored to the
// slot end so the offset + no-quote window measure from after the visit.
async function handleAppointmentQuoteNudge(data: EventJobData) {
	if (!data.org_id) return;
	const [appointment] = await db
		.select()
		.from(appointments)
		.where(and(eq(appointments.id, data.resource_id), isNull(appointments.deleted_at)));
	if (!appointment || appointment.status !== 'completed') return;
	// A completed but never-dated (unscheduled) visit has no time to anchor the offset nudge to.
	if (appointment.scheduled_start === null) return;
	await enroll({
		orgId: data.org_id,
		sequenceKey: 'appointment_quote_nudge',
		contactId: appointment.contact_id,
		resourceType: 'appointment',
		resourceId: appointment.id,
		anchorAt: appointment.scheduled_end ?? appointment.scheduled_start
	});
}

// ---- Cancellation hooks invoked by outbox routing ----

async function handleQuoteAcceptedCancel(data: EventJobData) {
	if (!data.org_id) return;
	await stopEnrollmentsForResource(data.org_id, 'quote', data.resource_id, 'quote_accepted');
}

async function handleQuoteDeclinedCancel(data: EventJobData) {
	if (!data.org_id) return;
	await stopEnrollmentsForResource(data.org_id, 'quote', data.resource_id, 'quote_declined');
}

async function handleQuoteViewedCancel(data: EventJobData) {
	if (!data.org_id) return;
	await stopEnrollmentsForResource(data.org_id, 'quote', data.resource_id, 'quote_viewed');
}

async function handleQuoteChangesRequestedCancel(data: EventJobData) {
	if (!data.org_id) return;
	await stopEnrollmentsForResource(
		data.org_id,
		'quote',
		data.resource_id,
		'quote_changes_requested'
	);
}

// ---- Quote decision → pipeline Won/Lost (Stage 1.2.A) ----
// A client accepting/declining on the public quote page must move the linked
// deal. The transition is idempotent (no-op if the deal is missing, not linked,
// or already closed) and reuses the exact Flow-2 side effects of the manual
// "Mark Won"/"Mark Lost" buttons via the shared transition helpers.

async function loadOpenOpportunityForQuote(orgId: string, quoteId: string) {
	const [quote] = await db
		.select({
			opportunity_id: quotes.opportunity_id,
			decline_reason: quotes.decline_reason,
			decline_reason_note: quotes.decline_reason_note,
			deposit_required: quotes.deposit_required
		})
		.from(quotes)
		.where(and(eq(quotes.id, quoteId), eq(quotes.org_id, orgId)))
		.limit(1);
	if (!quote?.opportunity_id) return null;

	const [opp] = await db
		.select()
		.from(opportunities)
		.where(
			and(
				eq(opportunities.id, quote.opportunity_id),
				eq(opportunities.org_id, orgId),
				isNull(opportunities.deleted_at)
			)
		)
		.limit(1);
	if (!opp || opp.status !== 'open') return null;
	return { opp, quote };
}

async function handleQuoteAcceptedWon(data: EventJobData) {
	if (!data.org_id) return;
	const found = await loadOpenOpportunityForQuote(data.org_id, data.resource_id);
	if (!found) return;

	// Org setting (PLAN §9): when Won is gated on the deposit, acceptance alone does NOT
	// win the deal — it stays in Quoted until quote.deposit_paid arrives (pipeline_deposit_won).
	// Exception: a quote with no deposit required can never produce a deposit event, so
	// acceptance still wins (industry-standard fallback).
	const [org] = await db
		.select({ won_trigger: organizations.won_trigger })
		.from(organizations)
		.where(eq(organizations.id, data.org_id))
		.limit(1);
	if (org?.won_trigger === 'deposit_paid' && found.quote.deposit_required) return;

	await markOpportunityWon(found.opp);
}

// quote.deposit_paid → mark the linked deal Won, but ONLY when the org gates Won on the
// deposit. Under the default 'quote_acceptance' trigger the deal is already Won (the
// open-check in loadOpenOpportunityForQuote no-ops here), so this is gated for clarity.
// Idempotent: no-op if no linked open deal (already closed / never linked).
async function handleQuoteDepositWon(data: EventJobData) {
	if (!data.org_id) return;
	const [org] = await db
		.select({ won_trigger: organizations.won_trigger })
		.from(organizations)
		.where(eq(organizations.id, data.org_id))
		.limit(1);
	if (org?.won_trigger !== 'deposit_paid') return;

	const found = await loadOpenOpportunityForQuote(data.org_id, data.resource_id);
	if (!found) return;
	await markOpportunityWon(found.opp);
}

async function handleQuoteDeclinedLost(data: EventJobData) {
	if (!data.org_id) return;
	const found = await loadOpenOpportunityForQuote(data.org_id, data.resource_id);
	if (!found) return;
	await markOpportunityLost(
		found.opp,
		found.quote.decline_reason ?? 'other',
		found.quote.decline_reason_note ?? null
	);
}

async function handleInvoicePaidCancel(data: EventJobData) {
	if (!data.org_id) return;
	await stopEnrollmentsForResource(data.org_id, 'invoice', data.resource_id, 'invoice_paid');
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
				return handleSpeedToLeadEnroll(data);
			case 'automation.advance':
				return advanceEnrollment(data.payload.enrollment_id as string);
			case 'automation.resume':
				return resumeEnrollment(data.payload.enrollment_id as string);
			case 'automation.lead_reply':
				return handleEngineLeadReply(data);
			case 'automation.staff_reply':
				return handleEngineStaffReply(data);
			case 'automation.call_spoke':
				return handleEngineCallSpoke(data);
			case 'automation.opp_won':
				return handleEngineOppClosed(data, 'won');
			case 'automation.opp_lost':
				return handleEngineOppClosed(data, 'lost');
			case 'missed_call_textback':
				return handleMissedCallTextbackEnroll(data);
			case 'pipeline_auto_create':
				return handlePipelineAutoCreate(data);
			case 'pipeline_auto_advance':
				return handlePipelineAutoAdvance(data);
			case 'pipeline_quote_won':
				return handleQuoteAcceptedWon(data);
			case 'pipeline_deposit_won':
				return handleQuoteDepositWon(data);
			case 'pipeline_quote_lost':
				return handleQuoteDeclinedLost(data);
			case 'invoice_dispatch':
				return handleInvoiceDispatch(data);
			case 'invoice_reminders_toggle':
				return handleInvoiceRemindersToggle(data);
			case 'quote_followup':
				// Only ever enqueued for quote.sent now; follow-ups run on the engine
				// (automation.advance). Stage 3.c.2.
				return handleQuoteFollowupSetup(data);
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
			case 'job_scheduled_confirmation':
				return handleJobScheduledConfirmation(data);
			case 'appointment_reschedule':
				return handleAppointmentRescheduled(data);
			case 'appointment_reschedule_confirmation':
				return handleAppointmentRescheduleConfirmation(data);
			case 'appointment_cancel_reminders':
				return handleAppointmentCancelReminders(data);
			case 'appointment_no_show_followup':
				return handleAppointmentNoShowFollowup(data);
			case 'appointment_quote_nudge':
				return handleAppointmentQuoteNudge(data);
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
