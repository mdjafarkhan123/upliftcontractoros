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
	// Audit-only: merge has no downstream automation/notification consumer. The
	// row is preserved in outbox_events as a permanent record of the merge.
	'contact.merged'
]);

function routeEvent(event: OutboxEvent): QueueTarget[] {
	switch (event.event_type) {
		case 'message.media.received':
			// Inbound MMS — fetch the (private, expiring) Twilio media and persist
			// it to R2 + the media table so the photo shows in the thread.
			return [{ queue: 'media', jobName: 'message.media.received' }];
		case 'contact.created':
		case 'lead.created':
			return [{ queue: 'automation', jobName: 'speed_to_lead' }];
		case 'call.missed':
			return [
				{ queue: 'automation', jobName: 'missed_call_textback' },
				{ queue: 'notification', jobName: event.event_type }
			];
		case 'quote.sent':
			return [{ queue: 'automation', jobName: 'quote_followup' }];
		case 'invoice.sent':
			return [{ queue: 'automation', jobName: 'invoice_dispatch' }];
		case 'job.completed':
			return [{ queue: 'automation', jobName: 'review.send' }];
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
		case 'appointment.created':
		case 'appointment.booked':
			// Confirmation fires immediately (gated to booking_link inside the
			// handler); reminders are pre-scheduled by appointment_reminder.
			return [
				{ queue: 'automation', jobName: 'appointment_reminder' },
				{ queue: 'automation', jobName: 'appointment_confirmation' }
			];
		case 'appointment.rescheduled':
			return [{ queue: 'automation', jobName: 'appointment_reschedule' }];
		case 'appointment.completed':
		case 'appointment.cancelled':
		case 'appointment.no_show':
			return [{ queue: 'automation', jobName: 'appointment_cancel_reminders' }];
		case 'payment.recorded':
			return [{ queue: 'notification', jobName: 'payment.recorded' }];
		case 'invoice.viewed':
			return [{ queue: 'notification', jobName: 'invoice.viewed' }];
		case 'opportunity.created':
		case 'opportunity.assignee_changed':
		case 'opportunity.lost':
			return [{ queue: 'notification', jobName: event.event_type }];
		case 'opportunity.stage_changed':
		case 'contact.status_changed':
			// Feed-only events: persisted to activity_events for the dashboard,
			// no notification dispatch. Explicit empty return suppresses the
			// "no route" warning while still marking the outbox row processed.
			return [];
		case 'opportunity.won':
		case 'job.created':
		case 'invoice.paid':
		case 'quote.viewed':
		case 'quote.accepted':
		case 'quote.declined':
		case 'quote.changes_requested':
		case 'quote.deposit_paid':
		case 'message.received':
		case 'message.delivery_failed':
		case 'review.received':
		case 'private_feedback.received':
		case 'negative_feedback':
		case 'contact.sms_opted_in':
		case 'contact.follow_up_due':
		case 'sms.credit_low':
			return [{ queue: 'notification', jobName: event.event_type }];
		case 'media.deleted':
			return [];
		case 'email.send.requested':
			return [{ queue: 'email', jobName: 'email.send.requested' }];
		case 'sms.send.requested':
			return [{ queue: 'sms', jobName: 'sms.send.requested' }];
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

type DispatchResult = { status: 'routed' } | { status: 'unrouted'; reason: string };

async function dispatch(event: OutboxEvent): Promise<DispatchResult> {
	if (event.event_type === 'media.deleted') {
		await handleMediaDeleted(event);
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
		const events = rows as unknown as OutboxEvent[];
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
