import postgres from 'postgres';
import { sql, and, eq, lte, inArray } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import { outboxEvents, type OutboxEvent } from '$lib/server/db/schema';
import { env } from '$env/dynamic/private';
import { automationQueue, notificationQueue, addJob } from '$lib/server/queue/bullmq';

const BATCH_SIZE = 10;
const POLL_INTERVAL_MS = 30_000;
const OUTBOX_CHANNEL = 'outbox_channel';

type QueueTarget = { queue: 'automation' | 'notification'; jobName: string };

function routeEvent(event: OutboxEvent): QueueTarget[] {
	switch (event.event_type) {
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
		case 'job.completed':
			return [{ queue: 'automation', jobName: 'review_request' }];
		case 'invoice.overdue':
			return [{ queue: 'automation', jobName: 'invoice_reminder' }];
		case 'appointment.created':
		case 'appointment.booked':
			return [{ queue: 'automation', jobName: 'appointment_reminder' }];
		case 'appointment.rescheduled':
			return [{ queue: 'automation', jobName: 'appointment_reschedule' }];
		case 'opportunity.won':
		case 'job.created':
		case 'invoice.paid':
		case 'quote.viewed':
		case 'quote.accepted':
		case 'quote.declined':
		case 'message.received':
		case 'review.received':
		case 'private_feedback.received':
		case 'negative_feedback':
		case 'contact.sms_opted_in':
			return [{ queue: 'notification', jobName: event.event_type }];
		case 'media.deleted':
			return [];
		default:
			return [];
	}
}

async function dispatch(event: OutboxEvent): Promise<void> {
	const targets = routeEvent(event);
	if (targets.length === 0) {
		if (event.event_type === 'media.deleted') {
			console.log(
				`[outbox] media.deleted event ${event.id} — R2 cleanup handler not yet implemented (Chapter 16)`
			);
			return;
		}
		console.warn(`[outbox] no route for event_type=${event.event_type} id=${event.id}`);
		return;
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
		const queue = target.queue === 'automation' ? automationQueue() : notificationQueue();
		await addJob(queue, target.jobName, data);
	}
}

async function processBatch(): Promise<number> {
	return db.transaction(async (tx) => {
		const rows = await tx.execute<OutboxEvent>(sql`
			SELECT * FROM outbox_events
			WHERE status = 'pending' AND available_at <= now()
			ORDER BY sequence ASC
			FOR UPDATE SKIP LOCKED
			LIMIT ${BATCH_SIZE}
		`);
		const events = rows as unknown as OutboxEvent[];
		if (events.length === 0) return 0;

		const succeededIds: string[] = [];
		for (const event of events) {
			try {
				await tx
					.update(outboxEvents)
					.set({ status: 'processing', updated_at: new Date() })
					.where(eq(outboxEvents.id, event.id));
				await dispatch(event);
				succeededIds.push(event.id);
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);
				const nextAttempt = event.attempts + 1;
				const isDead = nextAttempt >= event.max_attempts;
				const backoffMs = Math.min(2 ** nextAttempt * 60_000, 60 * 60_000);
				await tx
					.update(outboxEvents)
					.set({
						status: isDead ? 'dead_lettered' : 'pending',
						attempts: nextAttempt,
						last_error: message,
						available_at: isDead ? event.available_at : new Date(Date.now() + backoffMs),
						dead_lettered_at: isDead ? new Date() : null,
						updated_at: new Date()
					})
					.where(eq(outboxEvents.id, event.id));
				console.error(`[outbox] dispatch failed event=${event.id} attempt=${nextAttempt}: ${message}`);
			}
		}

		if (succeededIds.length > 0) {
			await tx
				.update(outboxEvents)
				.set({ status: 'processed', processed_at: new Date(), updated_at: new Date() })
				.where(and(eq(outboxEvents.status, 'processing'), inArray(outboxEvents.id, succeededIds)));
		}

		return events.length;
	});
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
	const url = env.DATABASE_URL;
	if (!url) throw new Error('DATABASE_URL is required.');
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
