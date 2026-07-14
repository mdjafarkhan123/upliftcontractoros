import postgres from 'postgres';
import { sql, eq, inArray } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import {
	outboxEvents,
	organizations,
	activityEvents,
	type OutboxEvent
} from '$lib/server/db/schema';
import { ACTIVITY_ALLOWLIST } from '$lib/server/dashboard/activityRegistry';
const env = process.env;
import {
	automationQueue,
	notificationQueue,
	emailQueue,
	smsQueue,
	mediaQueue,
	messengerQueue,
	addJob
} from '$lib/server/queue/bullmq';
import { r2DeleteObjects } from '$lib/server/media/r2';
import { sendSystemEmail } from '$lib/server/email/sendSystemEmail';
import { buildForwardVerificationEmail } from '$lib/server/email/forwardingVerification';
import { renderMemberEmail } from '$lib/server/notifications/memberDelivery';
import { featureForWorkerEvent } from '$lib/permissions/featureMap';
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

const BATCH_SIZE = 10;
const POLL_INTERVAL_MS = 30_000;
const OUTBOX_CHANNEL = 'outbox_channel';

type QueueTarget = {
	queue: 'automation' | 'notification' | 'email' | 'sms' | 'media' | 'messenger';
	jobName: string;
	delayMs?: number;
};

// Events that have no downstream queue but are still considered successfully
// "routed" by the worker — they exist solely to populate activity_events / be
// preserved in the outbox audit trail. Returning [] from routeEvent + listing
// the event here suppresses the "no route" warning and skips dispatch failure.
const FEED_ONLY_EVENTS = new Set<string>([
	'opportunity.stage_changed',
	'contact.status_changed',
	// Feed/audit only — every new contact (manual, import, inbound, web) writes a
	// "New lead" activity row, but contact.created is NOT a Speed-to-Lead trigger.
	// The auto-text is gated on 'lead.created', which only genuine inbound-capture
	// channels emit. Keeping contact.created here preserves the dashboard feed row.
	'contact.created',
	// Audit-only: merge has no downstream automation/notification consumer. The
	// row is preserved in outbox_events as a permanent record of the merge.
	'contact.merged',
	// A logged call with a non-spoke outcome (voicemail/no answer/wrong number)
	// has no consumer — the row stays in outbox_events as a permanent audit record.
	// (The 'spoke' outcome routes to pipeline_auto_advance and never reaches here.)
	'call.logged'
]);

function routeEvent(event: OutboxEvent): QueueTarget[] {
	switch (event.event_type) {
		case 'message.media.received':
			// Inbound MMS — fetch the (private, expiring) Twilio media and persist
			// it to R2 + the media table so the photo shows in the thread.
			return [{ queue: 'media', jobName: 'message.media.received' }];
		case 'contact.created':
			// Feed/audit only — NOT a Speed-to-Lead trigger (see FEED_ONLY_EVENTS).
			// Manual entry and CSV import create contacts but never emit lead.created,
			// so they never auto-text. Genuine inbound captures emit BOTH events: this
			// one writes the activity-feed row, lead.created fires the auto-text.
			return [];
		case 'lead.created':
			// Speed-to-Lead auto-text (gated per-org inside the automation handler)
			// AND a staff `new_lead` notification (Stage 1.d escalation source). The
			// notification is never feature-gated — a new lead must always be seen.
			return [
				{ queue: 'automation', jobName: 'speed_to_lead' },
				{ queue: 'notification', jobName: 'new_lead' },
				// Stage 3.a: auto-create a pipeline deal in the default stage (gated on
				// the org's auto_create_opp_on_lead toggle inside the handler).
				{ queue: 'automation', jobName: 'pipeline_auto_create' }
			];
		case 'call.missed':
			return [
				{ queue: 'automation', jobName: 'missed_call_textback' },
				{ queue: 'notification', jobName: event.event_type }
			];
		case 'message.received':
			// Notification (existing) + sequence-engine pause on lead reply (Stage
			// 3.b, no-ops unless the contact has an active enrollment). Inbound does
			// NOT advance the pipeline — "Contacted" means staff reached out (see
			// message.sent / call.logged below).
			return [
				{ queue: 'notification', jobName: event.event_type },
				{ queue: 'automation', jobName: 'automation.lead_reply' }
			];
		case 'message.sent':
			// Sequence-engine stop on staff reply (Stage 3.b) + pipeline ratchet to
			// "Contacted" on first HUMAN outbound (Stage 1.1). Both handlers ignore
			// automation sends (sent_by=null) and no-op without something to act on.
			return [
				{ queue: 'automation', jobName: 'automation.staff_reply' },
				{ queue: 'automation', jobName: 'pipeline_auto_advance' }
			];
		case 'call.logged': {
			// A logged call only counts as two-way contact when staff actually spoke
			// to the lead. Other outcomes (voicemail/no answer/wrong number) emit the
			// event for audit but route nowhere — marked processed via FEED_ONLY_EVENTS.
			const outcome = (event.payload as { outcome?: string } | null)?.outcome;
			if (outcome === 'spoke') {
				return [
					{ queue: 'automation', jobName: 'pipeline_auto_advance' },
					{ queue: 'automation', jobName: 'automation.call_spoke' }
				];
			}
			return [];
		}
		case 'quote.sent':
			// Quote follow-up nurture + pipeline ratchet to "Quoted" (Stage 1.1).
			// The ratchet no-ops on re-sends (deal already at/past Quoted).
			return [
				{ queue: 'automation', jobName: 'quote_followup' },
				{ queue: 'automation', jobName: 'pipeline_auto_advance' }
			];
		case 'invoice.sent':
			return [{ queue: 'automation', jobName: 'invoice_dispatch' }];
		case 'job.completed':
			// Customer review request + (conditionally, inside the handler) the contractor's
			// "remind me to invoice" nudge when the job has invoice_on_close set.
			return [
				{ queue: 'automation', jobName: 'review.send' },
				{ queue: 'notification', jobName: 'job.completed' }
			];
		case 'review_request.sent':
			// Pre-schedule both the unengaged reminder (72h) and the absolute
			// expiry (14d). Each handler re-reads the row at fire time and
			// no-ops if the lifecycle has moved past the relevant state.
			return [
				{
					queue: 'automation',
					jobName: 'review.unengaged',
					delayMs: 72 * 60 * 60 * 1000
				},
				{
					queue: 'automation',
					jobName: 'review.expire',
					delayMs: 14 * 24 * 60 * 60 * 1000
				}
			];
		case 'review_request.engaged':
			// Customer submitted a rating ≥ 4. Pre-schedule both nudges; the
			// `nudge_count` row guard inside the worker prevents double-fires
			// even on retry.
			return [
				{
					queue: 'automation',
					jobName: 'review.nudge_1',
					delayMs: 24 * 60 * 60 * 1000
				},
				{
					queue: 'automation',
					jobName: 'review.nudge_2',
					delayMs: 72 * 60 * 60 * 1000
				}
			];
		case 'invoice.overdue':
			// Dunning reminders are pre-scheduled at invoice.sent time; the cron's
			// status-flip event is no longer routed to the reminder queue. Empty
			// return marks the outbox row processed without enqueueing anything
			// and suppresses the "no route" warning.
			return [];
		case 'invoice.reminders_toggled':
			// Per-invoice reminders switch flipped on an already-sent invoice
			// (the /reminders endpoint). The worker re-enrolls (on) or stops (off)
			// the invoice's dunning sequence. Drafts don't emit this — their flag is
			// read fresh at invoice.sent.
			return [{ queue: 'automation', jobName: 'invoice_reminders_toggle' }];
		case 'appointment.created':
		case 'appointment.booked':
			// Confirmation fires immediately (gated to booking_link inside the
			// handler); reminders are pre-scheduled by appointment_reminder; pipeline
			// ratchets to "Scheduled" (Stage 1.1 — any booked appointment, no
			// tentative gate; no-ops if the deal is already at/past Scheduled).
			return [
				{ queue: 'automation', jobName: 'appointment_reminder' },
				{ queue: 'automation', jobName: 'appointment_confirmation' },
				{ queue: 'automation', jobName: 'pipeline_auto_advance' }
			];
		case 'job.scheduled':
			// Client-facing "your job is booked" confirmation over the chosen channel(s).
			return [{ queue: 'automation', jobName: 'job_scheduled_confirmation' }];
		case 'appointment.rescheduled':
			return [{ queue: 'automation', jobName: 'appointment_reschedule' }];
		case 'appointment.reschedule_confirmation':
			// Client-facing "your appointment moved to…" over the chosen channel(s).
			// Only emitted by the PATCH handler when the contractor opted to notify.
			return [{ queue: 'automation', jobName: 'appointment_reschedule_confirmation' }];
		case 'appointment.cancelled':
			return [{ queue: 'automation', jobName: 'appointment_cancel_reminders' }];
		case 'appointment.completed':
			// Stop reminders + enroll the post-appointment "no quote sent" staff nudge.
			return [
				{ queue: 'automation', jobName: 'appointment_cancel_reminders' },
				{ queue: 'automation', jobName: 'appointment_quote_nudge' }
			];
		case 'appointment.no_show':
			// Stop reminders + enroll the customer no-show re-engagement nurture.
			return [
				{ queue: 'automation', jobName: 'appointment_cancel_reminders' },
				{ queue: 'automation', jobName: 'appointment_no_show_followup' }
			];
		case 'payment.recorded':
			return [{ queue: 'notification', jobName: 'payment.recorded' }];
		case 'invoice.viewed':
			return [{ queue: 'notification', jobName: 'invoice.viewed' }];
		case 'opportunity.created':
		case 'opportunity.assignee_changed':
			return [{ queue: 'notification', jobName: event.event_type }];
		case 'opportunity.lost':
			// Notification (existing) + sequence-engine stop (Stage 3.b).
			return [
				{ queue: 'notification', jobName: event.event_type },
				{ queue: 'automation', jobName: 'automation.opp_lost' }
			];
		case 'opportunity.stage_changed':
		case 'contact.status_changed':
			// Feed-only events: persisted to activity_events for the dashboard,
			// no notification dispatch. Explicit empty return suppresses the
			// "no route" warning while still marking the outbox row processed.
			return [];
		case 'opportunity.won':
			// Notification (existing) + sequence-engine stop (Stage 3.b).
			return [
				{ queue: 'notification', jobName: event.event_type },
				{ queue: 'automation', jobName: 'automation.opp_won' }
			];
		case 'quote.accepted':
			// Notification + cancel-hook (existing) AND move the linked deal to Won
			// (Stage 1.2.A — full Flow 2 runs in the worker, idempotent).
			return [
				{ queue: 'notification', jobName: event.event_type },
				{ queue: 'automation', jobName: 'pipeline_quote_won' }
			];
		case 'quote.declined':
			// Notification + cancel-hook (existing) AND move the linked deal to Lost
			// with the client's decline reason (Stage 1.2.A).
			return [
				{ queue: 'notification', jobName: event.event_type },
				{ queue: 'automation', jobName: 'pipeline_quote_lost' }
			];
		case 'quote.deposit_paid':
			// Notification (existing) AND — when the org gates Won on the deposit —
			// move the linked deal to Won (Stage 1.3.A). The automation handler is a
			// no-op under the default 'quote_acceptance' trigger.
			return [
				{ queue: 'notification', jobName: event.event_type },
				{ queue: 'automation', jobName: 'pipeline_deposit_won' }
			];
		case 'job.created':
		case 'invoice.paid':
		case 'quote.viewed':
		case 'quote.changes_requested':
		case 'quote.expired':
		case 'message.delivery_failed':
		case 'review.received':
		case 'private_feedback.received':
		case 'negative_feedback':
		case 'contact.sms_opted_in':
		case 'contact.follow_up_due':
		case 'opportunity.follow_up_due':
		case 'sms.credit_low':
		case 'contact_import.finished':
			return [{ queue: 'notification', jobName: event.event_type }];
		case 'media.deleted':
			return [];
		case 'email.send.requested':
			return [{ queue: 'email', jobName: 'email.send.requested' }];
		case 'sms.send.requested':
			return [{ queue: 'sms', jobName: 'sms.send.requested' }];
		case 'member_notification.sms.requested':
			// Staff alert SMS (1.c-2). Routed to the SMS queue (not inline like the
			// member email) because it must pass the org SMS master-gate + reserve
			// credit. The smsWorker branches on this job name — no messages row.
			return [{ queue: 'sms', jobName: 'member_notification.sms.requested' }];
		case 'messenger.send.requested':
			return [{ queue: 'messenger', jobName: 'messenger.send.requested' }];
		default:
			return [];
	}
}

async function handleMediaDeleted(event: OutboxEvent): Promise<void> {
	const payload = event.payload as {
		r2_key?: string;
		thumbnail_key?: string | null;
		web_key?: string | null;
	};
	const keys = [payload.r2_key, payload.thumbnail_key, payload.web_key].filter(
		(k): k is string => typeof k === 'string' && k.length > 0
	);
	if (keys.length === 0) {
		console.warn(`[outbox] media.deleted event ${event.id} has no R2 keys in payload`);
		return;
	}
	await r2DeleteObjects(keys);
	console.log(
		`[outbox] media.deleted: deleted ${keys.length} R2 object(s) for media ${event.resource_id}`
	);
}

// Carrier registration submitted by a contractor (Onboarding.md Step 4). Notifies
// the PO by system email so they can copy the data for manual Twilio submission.
// Handled inline (no BullMQ queue), mirroring media.deleted. Re-submits re-notify.
function escapeHtml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

async function handleCarrierSubmitted(event: OutboxEvent): Promise<void> {
	const to = env.SUPER_ADMIN_EMAIL;
	if (!to) {
		console.warn(
			`[outbox] carrier.submitted ${event.id}: SUPER_ADMIN_EMAIL not set — skipping PO email`
		);
		return;
	}

	const p = event.payload as {
		org_name?: string;
		country?: string;
		legal_business_name?: string;
		ein?: string | null;
		business_number?: string | null;
		website?: string | null;
		messaging_use_case?: string | null;
	};
	const orgName = p.org_name ?? 'A contractor';
	const country = p.country ?? '';
	const program = country === 'CA' ? 'CWTA' : '10DLC';

	const rows: [string, string | null | undefined][] = [
		['Organization', orgName],
		['Country', country],
		['Legal/Business name', p.legal_business_name],
		['EIN', p.ein],
		['Business Number', p.business_number],
		['Website', p.website],
		['Messaging use case', p.messaging_use_case]
	];
	const present = rows.filter(([, v]) => v != null && v !== '');

	const textBody = [
		`${orgName} submitted carrier registration details (${country} ${program}).`,
		'',
		...present.map(([k, v]) => `${k}: ${v}`),
		'',
		'Review and submit these to Twilio, then update the org status in /jafar.'
	].join('\n');

	const htmlBody = [
		`<p><strong>${escapeHtml(orgName)}</strong> submitted carrier registration details (${escapeHtml(`${country} ${program}`)}).</p>`,
		'<table style="border-collapse:collapse">',
		...present.map(
			([k, v]) =>
				`<tr><td style="padding:4px 12px 4px 0;color:#666">${escapeHtml(k)}</td><td style="padding:4px 0"><strong>${escapeHtml(String(v))}</strong></td></tr>`
		),
		'</table>',
		'<p>Review and submit these to Twilio, then update the org status in /jafar.</p>'
	].join('');

	await sendSystemEmail({
		to,
		subject: `Carrier registration submitted — ${orgName} (${country} ${program})`,
		text: textBody,
		html: htmlBody
	});
	console.log(`[outbox] carrier.submitted: PO notified for org ${event.org_id}`);
}

// Contractor requested setup/change of their branded email sending domain (Stage 2
// of the email identity plan). PO holds the DNS, so they apply the change manually
// in /jafar. Notifies the PO by system email. Handled inline (no BullMQ queue),
// mirroring carrier.submitted. Each request is its own event.
async function handleEmailDomainChangeRequested(event: OutboxEvent): Promise<void> {
	const to = env.SUPER_ADMIN_EMAIL;
	if (!to) {
		console.warn(
			`[outbox] email_domain.change_requested ${event.id}: SUPER_ADMIN_EMAIL not set — skipping PO email`
		);
		return;
	}

	const p = event.payload as {
		org_name?: string;
		request_type?: string;
		desired_domain?: string;
		desired_local_part?: string | null;
		note?: string | null;
		requested_by?: string | null;
	};
	const orgName = p.org_name ?? 'A contractor';
	const kind = p.request_type === 'change_domain' ? 'domain change' : 'new domain setup';

	const rows: [string, string | null | undefined][] = [
		['Organization', orgName],
		['Request type', kind],
		['Requested domain', p.desired_domain],
		['Preferred address name', p.desired_local_part],
		['Requested by', p.requested_by],
		['Note', p.note]
	];
	const present = rows.filter(([, v]) => v != null && v !== '');

	const textBody = [
		`${orgName} requested a ${kind} for their branded email sending domain.`,
		'',
		...present.map(([k, v]) => `${k}: ${v}`),
		'',
		'Set up / change the domain in /jafar, then mark the request resolved.'
	].join('\n');

	const htmlBody = [
		`<p><strong>${escapeHtml(orgName)}</strong> requested a ${escapeHtml(kind)} for their branded email sending domain.</p>`,
		'<table style="border-collapse:collapse">',
		...present.map(
			([k, v]) =>
				`<tr><td style="padding:4px 12px 4px 0;color:#666">${escapeHtml(k)}</td><td style="padding:4px 0"><strong>${escapeHtml(String(v))}</strong></td></tr>`
		),
		'</table>',
		'<p>Set up / change the domain in /jafar, then mark the request resolved.</p>'
	].join('');

	await sendSystemEmail({
		to,
		subject: `Email domain ${kind} requested — ${orgName}`,
		text: textBody,
		html: htmlBody
	});
	console.log(`[outbox] email_domain.change_requested: PO notified for org ${event.org_id}`);
}

// Staff-facing notification email (Notification system Stage 1.c-1). Delivered
// inline via sendSystemEmail — mirrors carrier.submitted/email_domain.change_requested
// (no BullMQ queue). The recipient is a team member's address, never a customer; the
// copy + deep link were rendered upstream and carried on the payload.
async function handleMemberNotificationEmail(event: OutboxEvent): Promise<void> {
	const p = event.payload as {
		to_email?: string;
		title?: string;
		body?: string | null;
		url?: string;
	};
	if (!p.to_email || !p.title || !p.url) {
		console.warn(
			`[outbox] member_notification.email ${event.id}: missing to_email/title/url — skipping`
		);
		return;
	}
	const { subject, text, html } = renderMemberEmail({
		title: p.title,
		body: p.body ?? null,
		url: p.url
	});
	await sendSystemEmail({ to: p.to_email, subject, text, html });
}

// Forwarding round-trip verification (Stage 1.3). Sends a coded email to the
// contractor's OWN inbox — if their forward rule works it returns through Brevo
// inbound and the processor flips the test to 'passed'. A system email, never sent
// to a customer; handled inline like the other system emails (no BullMQ queue).
async function handleForwardTestRequested(event: OutboxEvent): Promise<void> {
	const p = event.payload as {
		org_name?: string;
		target_email?: string;
		token?: string;
	};
	if (!p.target_email || !p.token) {
		console.warn(
			`[outbox] email_domain.forward_test_requested ${event.id}: missing target_email/token — skipping`
		);
		return;
	}
	const { subject, text, html } = buildForwardVerificationEmail({
		orgName: p.org_name ?? 'Your business',
		token: p.token
	});
	await sendSystemEmail({ to: p.target_email, subject, text, html });
	console.log(`[outbox] email_domain.forward_test_requested: sent for org ${event.org_id}`);
}

type DispatchResult = { status: 'routed' } | { status: 'unrouted'; reason: string };

async function dispatch(event: OutboxEvent): Promise<DispatchResult> {
	if (event.event_type === 'media.deleted') {
		await handleMediaDeleted(event);
		return { status: 'routed' };
	}
	if (event.event_type === 'carrier.submitted') {
		await handleCarrierSubmitted(event);
		return { status: 'routed' };
	}
	if (event.event_type === 'email_domain.change_requested') {
		await handleEmailDomainChangeRequested(event);
		return { status: 'routed' };
	}
	if (event.event_type === 'member_notification.email.requested') {
		await handleMemberNotificationEmail(event);
		return { status: 'routed' };
	}
	if (event.event_type === 'email_domain.forward_test_requested') {
		await handleForwardTestRequested(event);
		return { status: 'routed' };
	}
	if (event.org_id) {
		const requiredFeature = featureForWorkerEvent(event.event_type);
		if (requiredFeature && !(await isFeatureEnabled(event.org_id, requiredFeature))) {
			console.warn(
				`[outbox] dropped event_type=${event.event_type} id=${event.id} org=${event.org_id} reason=feature_disabled feature=${requiredFeature}`
			);
			return {
				status: 'unrouted',
				reason: `feature_disabled:${requiredFeature}`
			};
		}
	}
	const targets = routeEvent(event);
	if (targets.length === 0) {
		if (FEED_ONLY_EVENTS.has(event.event_type)) {
			return { status: 'routed' };
		}
		return {
			status: 'unrouted',
			reason: `no route for event_type=${event.event_type}`
		};
	}
	const data = {
		outbox_event_id: event.id,
		event_type: event.event_type,
		org_id: event.org_id,
		resource_type: event.resource_type,
		resource_id: event.resource_id,
		payload: event.payload
	};
	for (const target of targets) {
		const queue =
			target.queue === 'automation'
				? automationQueue()
				: target.queue === 'notification'
					? notificationQueue()
					: target.queue === 'email'
						? emailQueue()
						: target.queue === 'media'
							? mediaQueue()
							: target.queue === 'messenger'
								? messengerQueue()
								: smsQueue();
		// Deterministic jobId so a redelivered outbox event can never enqueue the
		// same job twice — BullMQ ignores an add whose id already exists. This is
		// the queue-level guard against the duplicate-send class of bug; the
		// at-least-once outbox loop relies on it for effectively-once dispatch.
		await addJob(queue, target.jobName, data, {
			jobId: `${event.id}__${target.jobName}`,
			...(target.delayMs ? { delay: target.delayMs } : {})
		});
	}
	return { status: 'routed' };
}

// Stuck-row recovery window: a row left in 'processing' (worker crashed between
// claim and finalize) becomes eligible for re-claim after this long. Re-dispatch
// is safe because addJob is jobId-deduped and the handlers are idempotent.
const PROCESSING_RECLAIM_MS = 5 * 60_000;

/**
 * Atomically claim a batch of due events: select pending (or stale 'processing')
 * rows under SKIP LOCKED and flip them to 'processing' in one short transaction.
 * No external calls happen here, so the tx commits fast and never holds locks
 * while awaiting Redis — that was the cause of the redelivery loop.
 */
async function claimBatch(): Promise<OutboxEvent[]> {
	const reclaimSeconds = Math.round(PROCESSING_RECLAIM_MS / 1000);
	return db.transaction(async (tx) => {
		// Keep a hard ceiling so a wedged session can't hold the row lock forever.
		// This tx does only DB work, so it always completes well under the limit.
		await tx.execute(sql`SET LOCAL statement_timeout = '15s'`);
		const rows = await tx.execute<OutboxEvent>(sql`
			SELECT * FROM outbox_events
			WHERE (
				status = 'pending'
				OR (status = 'processing' AND updated_at < now() - make_interval(secs => ${reclaimSeconds}))
			)
			AND available_at <= now()
			ORDER BY sequence ASC
			FOR UPDATE SKIP LOCKED
			LIMIT ${BATCH_SIZE}
		`);
		// Raw `tx.execute(sql...)` returns timestamp columns as STRINGS, not Date
		// objects. Downstream code feeds some of these back into Drizzle timestamp
		// columns (the dead-letter `available_at`; the activity `occurred_at` =
		// `created_at`), where Drizzle calls `.toISOString()` on them and throws
		// "value.toISOString is not a function". Coerce every timestamp field to a
		// Date here so the typed OutboxEvent shape matches reality.
		const events = (rows as unknown as OutboxEvent[]).map((e) => ({
			...e,
			available_at: e.available_at == null ? e.available_at : new Date(e.available_at),
			processed_at: e.processed_at == null ? e.processed_at : new Date(e.processed_at),
			dead_lettered_at:
				e.dead_lettered_at == null ? e.dead_lettered_at : new Date(e.dead_lettered_at),
			created_at: e.created_at == null ? e.created_at : new Date(e.created_at),
			updated_at: e.updated_at == null ? e.updated_at : new Date(e.updated_at)
		}));
		if (events.length === 0) return [];
		await tx
			.update(outboxEvents)
			.set({ status: 'processing', updated_at: new Date() })
			.where(
				inArray(
					outboxEvents.id,
					events.map((e) => e.id)
				)
			);
		return events;
	});
}

async function processBatch(): Promise<number> {
	const events = await claimBatch();
	if (events.length === 0) return 0;

	const routedIds: string[] = [];
	const unrouted: Array<{ id: string; reason: string }> = [];
	const failures: Array<{ event: OutboxEvent; error: string }> = [];
	const activityRowsToInsert: Array<typeof activityEvents.$inferInsert> = [];

	// External side effects (BullMQ enqueue, R2 delete) run here — OUTSIDE any
	// transaction. A failure or crash now leaves the row in 'processing', which
	// claimBatch reclaims after PROCESSING_RECLAIM_MS; redelivery is safe via
	// jobId dedup. Crucially, Redis is never enqueued inside a DB tx, so a tx that
	// can't commit can no longer fire un-tracked, ever-repeating sends.
	for (const event of events) {
		try {
			const result = await dispatch(event);
			if (result.status === 'routed') {
				routedIds.push(event.id);
				if (event.org_id && ACTIVITY_ALLOWLIST.includes(event.event_type)) {
					const payload = (event.payload ?? {}) as Record<string, unknown>;
					const contactIdRaw = payload.contact_id;
					const eventVersionRaw = payload.event_version;
					activityRowsToInsert.push({
						org_id: event.org_id,
						event_type: event.event_type,
						resource_type: event.resource_type,
						resource_id: event.resource_id,
						contact_id:
							typeof contactIdRaw === 'string' && contactIdRaw.length > 0 ? contactIdRaw : null,
						payload: payload,
						event_version:
							typeof eventVersionRaw === 'number' && Number.isFinite(eventVersionRaw)
								? eventVersionRaw
								: 1,
						occurred_at: event.created_at
					});
				}
			} else {
				console.warn(
					`[outbox] unrouted event_type=${event.event_type} id=${event.id} — marking processed (no retry)`
				);
				unrouted.push({ id: event.id, reason: result.reason });
			}
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			failures.push({ event, error: message });
			console.error(`[outbox] dispatch failed event=${event.id}: ${message}`);
		}
	}

	// Finalize all status transitions in one short tx with no external calls.
	await db.transaction(async (tx) => {
		if (routedIds.length > 0) {
			await tx
				.update(outboxEvents)
				.set({ status: 'processed', processed_at: new Date(), updated_at: new Date() })
				.where(inArray(outboxEvents.id, routedIds));
		}
		for (const u of unrouted) {
			await tx
				.update(outboxEvents)
				.set({
					status: 'processed',
					processed_at: new Date(),
					last_error: u.reason,
					updated_at: new Date()
				})
				.where(eq(outboxEvents.id, u.id));
		}
		for (const f of failures) {
			const nextAttempt = f.event.attempts + 1;
			const isDead = nextAttempt >= f.event.max_attempts;
			const backoffMs = Math.min(2 ** nextAttempt * 60_000, 60 * 60_000);
			await tx
				.update(outboxEvents)
				.set({
					status: isDead ? 'dead_lettered' : 'pending',
					attempts: nextAttempt,
					last_error: f.error,
					available_at: isDead ? f.event.available_at : new Date(Date.now() + backoffMs),
					dead_lettered_at: isDead ? new Date() : null,
					updated_at: new Date()
				})
				.where(eq(outboxEvents.id, f.event.id));
		}
		if (activityRowsToInsert.length > 0) {
			await tx.insert(activityEvents).values(activityRowsToInsert);
		}
	});

	return events.length;
}

let running = false;
let pollTimer: NodeJS.Timeout | null = null;
let listenClient: postgres.Sql | null = null;

async function tick() {
	if (running) return;
	running = true;
	try {
		let processed: number;
		do {
			processed = await processBatch();
		} while (processed === BATCH_SIZE);
	} catch (err) {
		console.error('[outbox] batch error:', err);
	} finally {
		running = false;
	}
}

async function startListener() {
	// LISTEN/NOTIFY needs a persistent session connection. The Supabase
	// transaction pooler (port 6543) does NOT support LISTEN and drops the
	// socket (CONNECTION_CLOSED). Prefer WORKER_DATABASE_URL (session pooler /
	// direct, 5432) — same resolution the main client uses for the worker runtime.
	const url = env.WORKER_DATABASE_URL || env.DATABASE_URL;
	if (!url) throw new Error('WORKER_DATABASE_URL or DATABASE_URL is required.');
	listenClient = postgres(url, { max: 1 });
	await listenClient.listen(OUTBOX_CHANNEL, () => {
		void tick();
	});
	console.log(`[outbox] listening on ${OUTBOX_CHANNEL}`);
}

export function startOutboxWorker() {
	void startListener().catch((err) => console.error('[outbox] listener error:', err));
	pollTimer = setInterval(() => void tick(), POLL_INTERVAL_MS);
	void tick();
}

export async function stopOutboxWorker() {
	if (pollTimer) clearInterval(pollTimer);
	pollTimer = null;
	if (listenClient) {
		await listenClient.end({ timeout: 5 });
		listenClient = null;
	}
}

startOutboxWorker();
