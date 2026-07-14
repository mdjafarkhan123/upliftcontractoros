import { and, asc, eq, gte, inArray, isNull, ne, notInArray } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import {
	appointments,
	automationEnrollments,
	automationSequences,
	automationSequenceSteps,
	contacts,
	invoices,
	notifications,
	organizations,
	orgMembers,
	quotes,
	type AutomationEnrollment,
	type AutomationSequence,
	type AutomationSequenceStep,
	type Contact,
	type NewNotification,
	type Organization
} from '$lib/server/db/schema';
import { automationQueue, addJob } from '$lib/server/queue/bullmq';
import { queueAutomationSms } from '$lib/server/conversations/queueAutomationSms';
import { queueAutomationEmail } from '$lib/server/conversations/queueAutomationEmail';
import { loadAssigneeMemberIds } from '$lib/server/appointments/assignees';
import { interpolate, type TemplateVars } from '$lib/server/workers/templates';
import { NOTIFICATION_SPEC } from '$lib/notifications/spec';
import { formatCurrency } from '$lib/utils/format';

const env = process.env;

// BullMQ job names handled by automationWorker for the engine.
export const ADVANCE_JOB = 'automation.advance';
export const RESUME_JOB = 'automation.resume';

// How long a lead-reply pause lasts before auto-resuming (PLAN.md Scenario E).
const LEAD_REPLY_PAUSE_MS = 2 * 60 * 60 * 1000;

// Anchor-relative (offset) steps whose fire time has already passed by more than
// this grace window are skipped, not fired late. Protects against blasting a
// "24h-before" reminder on an appointment booked an hour out (Stage 3.c.3).
const MISSED_STEP_GRACE_MS = 5 * 60 * 1000;

type StepChannel = AutomationSequenceStep['channel'];

// True when a step is anchor-relative (Stage 3.c.3) rather than forward-chained.
function isOffsetStep(step: AutomationSequenceStep): boolean {
	return step.offset_minutes !== null && step.offset_minutes !== undefined;
}

// The wall-clock time a step should fire. Offset steps (appointment reminders)
// anchor to `anchor` (the appointment's scheduled_start); delay steps fire
// `delay_minutes` after `prevRef` (the anchor at enroll for step 0, or `now` at
// advance — i.e. measured from the previous step's completion).
function stepFireTime(step: AutomationSequenceStep, anchor: Date | null, prevRef: Date): Date {
	if (isOffsetStep(step) && anchor) {
		return new Date(anchor.getTime() + (step.offset_minutes as number) * 60_000);
	}
	return new Date(prevRef.getTime() + step.delay_minutes * 60_000);
}

// Find the first step at/after `fromIndex` whose fire time hasn't already passed
// (offset steps only — delay steps fire `now + delay`, never missed). Returns the
// index + fire time, or null when every remaining step is in the past (e.g. an
// appointment booked after both its reminder windows) → the sequence is done.
function pickDueStep(
	steps: AutomationSequenceStep[],
	fromIndex: number,
	anchor: Date | null,
	prevRef: Date,
	now: Date
): { index: number; fireAt: Date } | null {
	for (let i = fromIndex; i < steps.length; i++) {
		const fireAt = stepFireTime(steps[i], anchor, prevRef);
		if (fireAt.getTime() >= now.getTime() - MISSED_STEP_GRACE_MS) {
			return { index: i, fireAt };
		}
	}
	return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

async function removeBullJob(jobId: string | null | undefined): Promise<void> {
	if (!jobId) return;
	try {
		const job = await automationQueue().getJob(jobId);
		if (job) await job.remove();
	} catch (err) {
		console.warn(`[engine] failed to remove bull job ${jobId}:`, err);
	}
}

// Deterministic per-step jobId so a redelivered schedule can't double-enqueue.
function advanceJobId(enrollmentId: string, stepIndex: number): string {
	return `adv:${enrollmentId}:${stepIndex}`;
}

async function scheduleAdvance(
	enrollmentId: string,
	stepIndex: number,
	delayMs: number
): Promise<string> {
	const job = await addJob(
		automationQueue(),
		ADVANCE_JOB,
		{
			outbox_event_id: advanceJobId(enrollmentId, stepIndex),
			event_type: ADVANCE_JOB,
			org_id: null,
			resource_type: 'automation_enrollment',
			resource_id: enrollmentId,
			payload: { enrollment_id: enrollmentId, step_index: stepIndex }
		},
		{ delay: Math.max(0, delayMs), jobId: advanceJobId(enrollmentId, stepIndex) }
	);
	return String(job.id);
}

// Quiet-hours evaluation in the org's own timezone (TCPA). Returns whether the
// current instant falls inside the org's customer-facing quiet window and, if
// so, how long until it re-opens. Approximate to the minute — recomputed on the
// next fire, and an early/late wake just re-checks.
function quietHoursDelay(org: Organization, now: Date): number {
	if (!org.quiet_hours_enabled) return 0;
	const parts = new Intl.DateTimeFormat('en-US', {
		timeZone: org.timezone,
		hour: 'numeric',
		minute: 'numeric',
		second: 'numeric',
		hour12: false
	}).formatToParts(now);
	const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
	const hour = get('hour') % 24;
	const minute = get('minute');
	const second = get('second');

	const start = org.quiet_hours_start_hour;
	const end = org.quiet_hours_end_hour;
	const overnight = start > end;
	const blocked = overnight ? hour >= start || hour < end : hour >= start && hour < end;
	if (!blocked) return 0;

	const hoursUntilEnd = hour < end ? end - hour : 24 - hour + end;
	// ms from now to the top of end_hour, + a 1-minute buffer past the boundary.
	const ms = hoursUntilEnd * 3_600_000 - minute * 60_000 - second * 1000 + 60_000;
	return Math.max(60_000, ms);
}

type Capabilities = { smsCapable: boolean; emailCapable: boolean };

function capabilities(org: Organization, contact: Contact): Capabilities {
	return {
		smsCapable: Boolean(org.sms_enabled && contact.phone && !contact.sms_opt_out),
		emailCapable: Boolean(contact.email && contact.email_opt_in)
	};
}

// Resolve which channels to send on, given the step/sequence channel and the
// contact's live capabilities. This is the GHL-style contact-data check: SMS
// first means "send SMS if a usable phone exists, otherwise email" — never a
// delivery-failure fallback.
function resolveSend(
	channel: StepChannel,
	caps: Capabilities
): { sendSms: boolean; sendEmail: boolean } {
	switch (channel) {
		case 'sms_first':
			if (caps.smsCapable) return { sendSms: true, sendEmail: false };
			return { sendSms: false, sendEmail: caps.emailCapable };
		case 'email_first':
			if (caps.emailCapable) return { sendSms: false, sendEmail: true };
			return { sendSms: caps.smsCapable, sendEmail: false };
		case 'both':
			return { sendSms: caps.smsCapable, sendEmail: caps.emailCapable };
		case 'sms_only':
			return { sendSms: caps.smsCapable, sendEmail: false };
		case 'email_only':
			return { sendSms: false, sendEmail: caps.emailCapable };
		default:
			return { sendSms: false, sendEmail: false };
	}
}

// Staff in-app alert recipients for an appointment (Stage 3.c.3b): the office
// (admins/managers) + the appointment's assigned crew, deduped. Kept local so the
// engine doesn't import the notification worker; mirrors its
// appointmentStaffRecipients.
const ADMIN_MANAGER_ROLES = ['admin', 'manager'] as const;

async function staffRecipientsForAppointment(
	orgId: string,
	appointmentId: string
): Promise<string[]> {
	const [admins, crew] = await Promise.all([
		db
			.select({ id: orgMembers.id })
			.from(orgMembers)
			.where(
				and(
					eq(orgMembers.org_id, orgId),
					eq(orgMembers.is_active, true),
					isNull(orgMembers.deleted_at),
					inArray(orgMembers.role, [...ADMIN_MANAGER_ROLES])
				)
			),
		loadAssigneeMemberIds(db, appointmentId)
	]);
	const ids = new Set<string>();
	for (const a of admins) ids.add(a.id);
	for (const c of crew) ids.add(c);
	return [...ids];
}

// Fire-time step gate (Stage 3.c.3b). Returns whether the step should send.
// `no_quote_since_anchor`: only alert when NO quote exists for the contact created
// at/after the anchor (the appointment) — a quote already raised silences the nudge.
async function conditionMet(
	condition: string | null,
	opts: { orgId: string; contactId: string; anchor: Date | null }
): Promise<boolean> {
	if (!condition) return true;
	if (condition === 'no_quote_since_anchor') {
		const since = opts.anchor ?? new Date(0);
		const [row] = await db
			.select({ id: quotes.id })
			.from(quotes)
			.where(
				and(
					eq(quotes.org_id, opts.orgId),
					eq(quotes.contact_id, opts.contactId),
					isNull(quotes.deleted_at),
					gte(quotes.created_at, since)
				)
			)
			.limit(1);
		return !row;
	}
	return true;
}

// Deliver an in-app staff alert instead of a customer message (Stage 3.c.3b).
// Best-effort, like every other send. Uses the step's email_subject as the
// notification title and sms_body as the body (both template-interpolated), so the
// 3.d UI edits the same fields. Idempotent per (resource, member).
async function sendStaffAlert(
	orgId: string,
	step: AutomationSequenceStep,
	vars: TemplateVars,
	resourceType: string,
	resourceId: string
): Promise<void> {
	if (resourceType !== 'appointment') return; // only appointment staff alerts today
	const recipients = await staffRecipientsForAppointment(orgId, resourceId);
	if (recipients.length === 0) return;

	const spec = NOTIFICATION_SPEC.appointment_quote_nudge;
	const title = step.email_subject ? interpolate(step.email_subject, vars) : spec.label;
	const body = step.sms_body ? interpolate(step.sms_body, vars) : null;
	const rows: NewNotification[] = recipients.map((memberId) => ({
		org_id: orgId,
		member_id: memberId,
		type: 'appointment_quote_nudge',
		title,
		body,
		resource_type: 'appointment',
		resource_id: resourceId,
		route: spec.route(resourceId),
		priority: spec.priority,
		idempotency_key: `appointment_quote_nudge:${resourceId}:${memberId}`
	}));
	try {
		await db
			.insert(notifications)
			.values(rows)
			.onConflictDoNothing({
				target: notifications.idempotency_key,
				where: sql`idempotency_key IS NOT NULL`
			});
	} catch (err) {
		console.error('[engine] staff alert insert failed:', err);
	}
}

async function sendStep(
	orgId: string,
	org: Organization,
	contact: Contact,
	step: AutomationSequenceStep,
	sequenceChannel: StepChannel,
	source: string,
	resourceVars: Partial<TemplateVars> = {},
	resourceType: string = 'contact',
	resourceId: string = contact.id
): Promise<void> {
	const vars: TemplateVars = {
		contact_name: contact.full_name,
		org_name: org.name,
		...resourceVars
	};

	// Staff-audience steps deliver an in-app alert to the team, not the customer —
	// channel/opt-out resolution below doesn't apply.
	if (step.audience === 'staff') {
		await sendStaffAlert(orgId, step, vars, resourceType, resourceId);
		return;
	}

	const channel = step.channel ?? sequenceChannel;
	const { sendSms, sendEmail } = resolveSend(channel, capabilities(org, contact));

	if (sendSms && step.sms_body) {
		try {
			await queueAutomationSms(db, {
				orgId,
				contactId: contact.id,
				body: interpolate(step.sms_body, vars),
				source
			});
		} catch (err) {
			console.error(`[engine] ${source} SMS queue failed:`, err);
		}
	}

	if (sendEmail && contact.email && step.email_body) {
		try {
			await queueAutomationEmail(db, {
				orgId,
				contactId: contact.id,
				contactEmail: contact.email,
				subject: interpolate(step.email_subject ?? '', vars),
				body: interpolate(step.email_body, vars),
				source
			});
		} catch (err) {
			console.error(`[engine] ${source} email dispatch failed:`, err);
		}
	}
}

async function loadOrg(orgId: string): Promise<Organization | null> {
	const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId));
	return org ?? null;
}

async function loadContact(orgId: string, contactId: string): Promise<Contact | null> {
	const [contact] = await db
		.select()
		.from(contacts)
		.where(and(eq(contacts.id, contactId), eq(contacts.org_id, orgId)));
	return contact ?? null;
}

function publicInvoiceUrl(token: string): string {
	const base = env.APP_URL ?? 'http://localhost:5173';
	return `${base.replace(/\/$/, '')}/i/${token}`;
}

// Resource-anchored cards (Stage 3.c.2). At send time the engine re-reads the
// underlying quote/invoice to (a) stop the sequence if the resource has closed
// since the last step (a missed stop-event must never nudge a paid invoice or an
// accepted quote) and (b) build resource-aware template vars. Contact-anchored
// cards have no resource → no extra vars, never closed.
// anchorOverride (Stage 3.c.3): the live offset anchor read at fire time. For
// appointments this is the current scheduled_start, so a reschedule we missed is
// self-healed when the next step is scheduled. Omitted for non-offset resources.
type ResourceContext = {
	closed: boolean;
	closedReason: string;
	vars: Partial<TemplateVars>;
	anchorOverride?: Date;
};

// Format an appointment time for the org's timezone — split into datetime/date/
// time so templates can use each independently. Mirrors automationWorker's
// formatAppointmentForOrg (confirmation copy) so reminders read identically.
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

// Which appointment status a given sequence runs ON. Reminders fire while the
// appointment is still 'scheduled'; the post-appointment "no quote" nudge runs on a
// 'completed' one (Stage 3.c.3b). A status that drifts off the expected value stops
// the sequence at fire time.
const APPOINTMENT_SEQUENCE_STATUS: Record<string, string> = {
	appointment_reminder: 'scheduled',
	appointment_quote_nudge: 'completed'
};

async function loadResourceContext(
	orgId: string,
	org: Organization,
	resourceType: string,
	resourceId: string,
	sequenceKey: string
): Promise<ResourceContext> {
	const phone = org.twilio_phone_number ?? '';

	if (resourceType === 'quote') {
		const [quote] = await db
			.select()
			.from(quotes)
			.where(and(eq(quotes.id, resourceId), eq(quotes.org_id, orgId)));
		// Mirrors handleQuoteFollowup's guard: only an open (sent/viewed) quote nudges.
		if (!quote || quote.deleted_at) return { closed: true, closedReason: 'quote_missing', vars: {} };
		if (quote.status !== 'sent' && quote.status !== 'viewed') {
			return { closed: true, closedReason: 'quote_closed', vars: {} };
		}
		return {
			closed: false,
			closedReason: '',
			vars: {
				phone,
				quote_number: `#${quote.quote_number}`,
				quote_amount: formatCurrency(quote.total),
				amount: formatCurrency(quote.total)
			}
		};
	}

	if (resourceType === 'invoice') {
		const [invoice] = await db
			.select()
			.from(invoices)
			.where(and(eq(invoices.id, resourceId), eq(invoices.org_id, orgId)));
		// Mirrors handleInvoiceReminder's guard: a paid/cancelled invoice stops dunning.
		if (!invoice || invoice.deleted_at) {
			return { closed: true, closedReason: 'invoice_missing', vars: {} };
		}
		if (invoice.status === 'paid' || invoice.status === 'cancelled') {
			return { closed: true, closedReason: 'invoice_closed', vars: {} };
		}
		const payLink = invoice.public_token
			? publicInvoiceUrl(invoice.public_token)
			: (invoice.stripe_payment_link_url ?? '');
		const dueDate = invoice.due_date
			? new Date(invoice.due_date + 'T00:00:00').toLocaleDateString('en-US', {
					month: 'long',
					day: 'numeric',
					year: 'numeric'
				})
			: '';
		return {
			closed: false,
			closedReason: '',
			vars: {
				phone,
				invoice_number: `#${invoice.invoice_number}`,
				amount: formatCurrency(invoice.amount_due),
				payment_link: payLink,
				due_date: dueDate
			}
		};
	}

	if (resourceType === 'appointment') {
		const [appt] = await db
			.select()
			.from(appointments)
			.where(and(eq(appointments.id, resourceId), eq(appointments.org_id, orgId)));
		// Each appointment sequence runs on a specific status (reminders → scheduled,
		// quote nudge → completed). A status that drifts off the expected value (or a
		// soft delete) stops the sequence — a missed stop-event must never nudge about a
		// visit that isn't in the state the sequence assumes.
		if (!appt || appt.deleted_at) {
			return { closed: true, closedReason: 'appointment_missing', vars: {} };
		}
		const expected = APPOINTMENT_SEQUENCE_STATUS[sequenceKey] ?? 'scheduled';
		if (appt.status !== expected) {
			return { closed: true, closedReason: `appointment_${appt.status}`, vars: {} };
		}
		// An unscheduled visit (no date) can't anchor a time-based reminder sequence — close out.
		if (appt.scheduled_start === null) {
			return { closed: true, closedReason: 'appointment_unscheduled', vars: {} };
		}
		const formatted = formatAppointmentForOrg(appt.scheduled_start, org.timezone);
		return {
			closed: false,
			closedReason: '',
			// Reminders anchor to the live scheduled_start so an unprocessed reschedule
			// self-heals. The post-appointment nudge anchors to the slot END (so its
			// "+Nh after" offset and the no-quote-since check measure from after the visit).
			anchorOverride:
				sequenceKey === 'appointment_quote_nudge'
					? (appt.scheduled_end ?? appt.scheduled_start)
					: appt.scheduled_start,
			vars: {
				phone,
				appointment_datetime: formatted.datetime,
				appointment_date: formatted.date,
				appointment_time: formatted.time,
				appointment_type: appt.type.replaceAll('_', ' '),
				location: appt.location ?? ''
			}
		};
	}

	return { closed: false, closedReason: '', vars: {} };
}

async function loadSequence(id: string): Promise<AutomationSequence | null> {
	const [seq] = await db.select().from(automationSequences).where(eq(automationSequences.id, id));
	return seq ?? null;
}

async function loadSteps(sequenceId: string): Promise<AutomationSequenceStep[]> {
	return db
		.select()
		.from(automationSequenceSteps)
		.where(eq(automationSequenceSteps.sequence_id, sequenceId))
		.orderBy(asc(automationSequenceSteps.position));
}

async function finalize(
	enrollmentId: string,
	fields: Partial<AutomationEnrollment>
): Promise<void> {
	await db
		.update(automationEnrollments)
		.set({ ...fields, updated_at: new Date() })
		.where(eq(automationEnrollments.id, enrollmentId));
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Enroll a contact into a sequence (by org + key) and schedule the instant
 * reply. No-op if the sequence is missing/disabled, the contact is unreachable
 * (do_not_contact), the sequence has no steps, or a non-terminal enrollment
 * already exists (the partial-unique index is the race guard).
 *
 * Called from the BullMQ automation worker — NOT inside a DB transaction — so
 * scheduling the first advance job here is allowed.
 */
export async function enroll(opts: {
	orgId: string;
	sequenceKey: string;
	contactId: string;
	resourceType: string;
	resourceId: string;
	// Base time for step 0's delay (Stage 3.c.2). Omit for contact-anchored cards
	// (anchor = now). Date-anchored cards (invoice dunning) pass the invoice
	// due_date so step 0 fires at due_date + step0.delay_minutes.
	anchorAt?: Date;
}): Promise<void> {
	const { orgId, sequenceKey, contactId, resourceType, resourceId, anchorAt } = opts;

	const [seq] = await db
		.select()
		.from(automationSequences)
		.where(and(eq(automationSequences.org_id, orgId), eq(automationSequences.key, sequenceKey)));
	if (!seq || !seq.enabled) return;

	const contact = await loadContact(orgId, contactId);
	if (!contact || contact.do_not_contact) return;

	const steps = await loadSteps(seq.id);
	if (steps.length === 0) return;

	const now = new Date();
	// Pick the first step that's actually due. Offset steps (appointment reminders)
	// anchor to anchorAt; delay steps measure step 0 from anchorAt (invoice dunning
	// → due_date) or now (contact cards → fires immediately, as before). A step
	// whose window already passed is skipped (short-notice booking); null = every
	// step is in the past, so there's nothing to enroll.
	const due = pickDueStep(steps, 0, anchorAt ?? null, anchorAt ?? now, now);
	if (!due) return;

	const [inserted] = await db
		.insert(automationEnrollments)
		.values({
			org_id: orgId,
			sequence_id: seq.id,
			contact_id: contactId,
			resource_type: resourceType,
			resource_id: resourceId,
			status: 'active',
			current_step: due.index,
			anchor_at: anchorAt ?? null,
			next_step_at: due.fireAt
		})
		.onConflictDoNothing({
			target: [
				automationEnrollments.sequence_id,
				automationEnrollments.contact_id,
				automationEnrollments.resource_id
			],
			where: sql`status IN ('active', 'paused')`
		})
		.returning();
	if (!inserted) return; // already enrolled

	const bullJobId = await scheduleAdvance(inserted.id, due.index, due.fireAt.getTime() - now.getTime());
	await finalize(inserted.id, { bull_job_id: bullJobId });
}

/**
 * The engine tick. Re-reads live state, applies quiet-hours reschedule, claims
 * the step atomically (so retries/redeliveries can't resend it), sends on the
 * resolved channel, then schedules the next step or completes.
 */
export async function advanceEnrollment(enrollmentId: string): Promise<void> {
	const [enr] = await db
		.select()
		.from(automationEnrollments)
		.where(eq(automationEnrollments.id, enrollmentId));
	if (!enr || enr.status !== 'active') return;

	const seq = await loadSequence(enr.sequence_id);
	if (!seq) return;
	if (!seq.enabled) {
		await finalize(enr.id, {
			status: 'stopped',
			stop_reason: 'sequence_disabled',
			stopped_at: new Date(),
			bull_job_id: null,
			next_step_at: null
		});
		return;
	}

	const steps = await loadSteps(seq.id);
	const step = steps[enr.current_step];
	if (!step) {
		await finalize(enr.id, {
			status: 'completed',
			completed_at: new Date(),
			bull_job_id: null,
			next_step_at: null
		});
		return;
	}

	const org = await loadOrg(enr.org_id);
	const contact = await loadContact(enr.org_id, enr.contact_id);
	if (!org || !contact) return;
	// do_not_contact stops customer-facing sequences; a staff-audience step (the
	// internal "no quote" nudge) is not a message to the customer, so a marketing
	// opt-out must not suppress the team's task reminder.
	if (contact.do_not_contact && step.audience !== 'staff') {
		await finalize(enr.id, {
			status: 'stopped',
			stop_reason: 'do_not_contact',
			stopped_at: new Date(),
			bull_job_id: null,
			next_step_at: null
		});
		return;
	}

	// Resource-anchored guard (Stage 3.c.2): stop if the quote/invoice closed
	// since the last step (a missed stop-event must not nudge a paid invoice or
	// an accepted/declined quote). No-op for contact-anchored cards.
	const resource = await loadResourceContext(
		enr.org_id,
		org,
		enr.resource_type,
		enr.resource_id,
		seq.key
	);
	if (resource.closed) {
		await finalize(enr.id, {
			status: 'stopped',
			stop_reason: resource.closedReason,
			stopped_at: new Date(),
			bull_job_id: null,
			next_step_at: null
		});
		return;
	}

	// Quiet hours: reschedule the SAME step to window-open without sending or
	// advancing. jobId is per-step so this is dedup-safe on redelivery. Offset
	// steps (appointment reminders, Stage 3.c.3) are time-bound/transactional —
	// deferring a "1h before" reminder past quiet hours could land it after the
	// visit, so they fire at their anchored time regardless.
	//
	// Quiet hours is a TCPA rule for SMS/voice only — email has no time-of-day
	// restriction, so it must never be deferred. Resolve the step's actual send
	// channels and apply quiet hours only when an SMS would go out. Staff steps
	// (in-app alerts) never send a customer message, so they're exempt too.
	const now = new Date();
	const willSendSms =
		step.audience !== 'staff' &&
		resolveSend(step.channel ?? seq.channel, capabilities(org, contact)).sendSms;
	const quietMs = isOffsetStep(step) || !willSendSms ? 0 : quietHoursDelay(org, now);
	if (quietMs > 0) {
		const bullJobId = await scheduleAdvance(enr.id, enr.current_step, quietMs);
		await finalize(enr.id, {
			next_step_at: new Date(now.getTime() + quietMs),
			bull_job_id: bullJobId
		});
		return;
	}

	// Atomic claim: advance current_step BEFORE sending so a concurrent fire of
	// the same step affects 0 rows and returns. Sends are best-effort (mirrors
	// the existing handlers); a failed send still advances the sequence.
	const nextStep = enr.current_step + 1;
	const [claimed] = await db
		.update(automationEnrollments)
		.set({ current_step: nextStep, last_step_sent_at: now, updated_at: now })
		.where(
			and(
				eq(automationEnrollments.id, enr.id),
				eq(automationEnrollments.current_step, enr.current_step),
				eq(automationEnrollments.status, 'active')
			)
		)
		.returning({ id: automationEnrollments.id });
	if (!claimed) return;

	const anchor = resource.anchorOverride ?? enr.anchor_at ?? null;

	// Fire-time condition gate (Stage 3.c.3b): a quote raised since the visit
	// silences the staff nudge. Unmet → skip the send but still advance/complete.
	const shouldSend = await conditionMet(step.condition, {
		orgId: enr.org_id,
		contactId: enr.contact_id,
		anchor
	});
	if (shouldSend) {
		await sendStep(
			enr.org_id,
			org,
			contact,
			step,
			seq.channel,
			`automation.${seq.key}.step_${step.position}`,
			resource.vars,
			enr.resource_type,
			enr.resource_id
		);
	}

	// Schedule the next due step. Offset steps anchor to the LIVE appointment time
	// (anchorOverride) so a reschedule self-heals; any step past its window is
	// skipped. Delay steps measure from now. null = the sequence is complete.
	const due = pickDueStep(steps, nextStep, anchor, now, now);
	if (!due) {
		await finalize(enr.id, {
			status: 'completed',
			completed_at: new Date(),
			bull_job_id: null,
			next_step_at: null
		});
		return;
	}
	const bullJobId = await scheduleAdvance(enr.id, due.index, due.fireAt.getTime() - now.getTime());
	// current_step may jump forward if steps were skipped — re-set it (post-claim,
	// so no atomic contention) so the next advance sends the right step.
	await finalize(enr.id, {
		current_step: due.index,
		next_step_at: due.fireAt,
		bull_job_id: bullJobId
	});
}

/**
 * Resume a paused enrollment (lead-reply +2h timer). No-op unless still paused —
 * a staff reply in the window will have already stopped it.
 */
export async function resumeEnrollment(enrollmentId: string): Promise<void> {
	const [enr] = await db
		.select()
		.from(automationEnrollments)
		.where(eq(automationEnrollments.id, enrollmentId));
	if (!enr || enr.status !== 'paused') return;

	const now = new Date();
	const bullJobId = await scheduleAdvance(enr.id, enr.current_step, 0);
	await finalize(enr.id, {
		status: 'active',
		pause_reason: null,
		paused_until: null,
		next_step_at: now,
		bull_job_id: bullJobId
	});
}

/**
 * Pause every ACTIVE enrollment for a contact (lead replied). Removes the
 * pending advance job, sets a +2h auto-resume, and schedules the resume job.
 * Staff are already alerted by the inbound message.received notification.
 */
export async function pauseEnrollmentsForLeadReply(
	orgId: string,
	contactId: string
): Promise<void> {
	const rows = await db
		.select()
		.from(automationEnrollments)
		.where(
			and(
				eq(automationEnrollments.org_id, orgId),
				eq(automationEnrollments.contact_id, contactId),
				eq(automationEnrollments.status, 'active'),
				// Appointment reminders (Stage 3.c.3) are time-bound — a +2h pause could
				// push a "1h before" reminder past the visit. They're driven only by the
				// appointment's own lifecycle, never by an inbound reply.
				ne(automationEnrollments.resource_type, 'appointment')
			)
		);
	if (rows.length === 0) return;

	const resumeAt = new Date(Date.now() + LEAD_REPLY_PAUSE_MS);
	for (const enr of rows) {
		await removeBullJob(enr.bull_job_id);
		const job = await addJob(
			automationQueue(),
			RESUME_JOB,
			{
				outbox_event_id: `resume:${enr.id}:${resumeAt.getTime()}`,
				event_type: RESUME_JOB,
				org_id: orgId,
				resource_type: 'automation_enrollment',
				resource_id: enr.id,
				payload: { enrollment_id: enr.id }
			},
			{ delay: LEAD_REPLY_PAUSE_MS }
		);
		await finalize(enr.id, {
			status: 'paused',
			pause_reason: 'lead_replied',
			paused_until: resumeAt,
			next_step_at: resumeAt,
			bull_job_id: String(job.id)
		});
	}
}

/**
 * Stop every non-terminal enrollment for a contact (staff reply, call=spoke,
 * won/lost, opt-out, manual). Removes the pending advance/resume job.
 *
 * `excludeResourceTypes` lets nurture-driven stop hooks (staff reply, call=spoke,
 * won/lost) leave appointment reminders alone — those are time-bound and stop
 * only on the appointment's own lifecycle. Opt-out/do_not_contact pass nothing so
 * a hard "stop contacting me" still clears everything.
 */
export async function stopEnrollmentsForContact(
	orgId: string,
	contactId: string,
	reason: string,
	excludeResourceTypes: string[] = []
): Promise<void> {
	const rows = await db
		.select()
		.from(automationEnrollments)
		.where(
			and(
				eq(automationEnrollments.org_id, orgId),
				eq(automationEnrollments.contact_id, contactId),
				inArray(automationEnrollments.status, ['active', 'paused']),
				...(excludeResourceTypes.length
					? [notInArray(automationEnrollments.resource_type, excludeResourceTypes)]
					: [])
			)
		);
	if (rows.length === 0) return;

	for (const enr of rows) {
		await removeBullJob(enr.bull_job_id);
	}
	await db
		.update(automationEnrollments)
		.set({
			status: 'stopped',
			stop_reason: reason,
			stopped_at: new Date(),
			bull_job_id: null,
			next_step_at: null,
			updated_at: new Date()
		})
		.where(
			inArray(
				automationEnrollments.id,
				rows.map((r) => r.id)
			)
		);
}

/**
 * Stop every non-terminal enrollment for a specific RESOURCE (Stage 3.c.2) —
 * quote accepted/declined/viewed/changes-requested, invoice paid. Resource-scoped
 * (not contact-scoped) so a contact's other open quotes/invoices keep running.
 */
export async function stopEnrollmentsForResource(
	orgId: string,
	resourceType: string,
	resourceId: string,
	reason: string
): Promise<void> {
	const rows = await db
		.select()
		.from(automationEnrollments)
		.where(
			and(
				eq(automationEnrollments.org_id, orgId),
				eq(automationEnrollments.resource_type, resourceType),
				eq(automationEnrollments.resource_id, resourceId),
				inArray(automationEnrollments.status, ['active', 'paused'])
			)
		);
	if (rows.length === 0) return;

	for (const enr of rows) {
		await removeBullJob(enr.bull_job_id);
	}
	await db
		.update(automationEnrollments)
		.set({
			status: 'stopped',
			stop_reason: reason,
			stopped_at: new Date(),
			bull_job_id: null,
			next_step_at: null,
			updated_at: new Date()
		})
		.where(
			inArray(
				automationEnrollments.id,
				rows.map((r) => r.id)
			)
		);
}

/**
 * Re-anchor every ACTIVE enrollment for a resource to a new anchor time (Stage
 * 3.c.3 — appointment rescheduled). Recomputes the next due step against the new
 * anchor (skipping any window now in the past), removes the stale advance job,
 * and reschedules. Handles "moved earlier" correctly, which the live-anchor
 * read at fire time alone cannot (the old job would fire late). Appointment
 * reminders are never paused, so only active enrollments need re-anchoring.
 */
export async function reanchorEnrollments(
	orgId: string,
	resourceType: string,
	resourceId: string,
	newAnchor: Date
): Promise<number> {
	const rows = await db
		.select()
		.from(automationEnrollments)
		.where(
			and(
				eq(automationEnrollments.org_id, orgId),
				eq(automationEnrollments.resource_type, resourceType),
				eq(automationEnrollments.resource_id, resourceId),
				eq(automationEnrollments.status, 'active')
			)
		);
	if (rows.length === 0) return 0;

	const now = new Date();
	for (const enr of rows) {
		const steps = await loadSteps(enr.sequence_id);
		const due = pickDueStep(steps, enr.current_step, newAnchor, now, now);
		await removeBullJob(enr.bull_job_id);
		if (!due) {
			await finalize(enr.id, {
				status: 'completed',
				completed_at: now,
				anchor_at: newAnchor,
				bull_job_id: null,
				next_step_at: null
			});
			continue;
		}
		const bullJobId = await scheduleAdvance(
			enr.id,
			due.index,
			due.fireAt.getTime() - now.getTime()
		);
		await finalize(enr.id, {
			anchor_at: newAnchor,
			current_step: due.index,
			next_step_at: due.fireAt,
			bull_job_id: bullJobId
		});
	}
	return rows.length;
}

/**
 * Stop a single enrollment by id (universal Stop Automation button).
 * Returns false if the enrollment doesn't exist or is already terminal.
 */
export async function stopEnrollmentById(
	orgId: string,
	enrollmentId: string,
	reason: string
): Promise<boolean> {
	const [enr] = await db
		.select()
		.from(automationEnrollments)
		.where(
			and(eq(automationEnrollments.id, enrollmentId), eq(automationEnrollments.org_id, orgId))
		);
	if (!enr || (enr.status !== 'active' && enr.status !== 'paused')) return false;

	await removeBullJob(enr.bull_job_id);
	await finalize(enr.id, {
		status: 'stopped',
		stop_reason: reason,
		stopped_at: new Date(),
		bull_job_id: null,
		next_step_at: null
	});
	return true;
}
