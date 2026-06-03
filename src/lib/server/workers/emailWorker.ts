import { Worker, type Job } from 'bullmq';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import {
	appointments,
	contacts,
	conversations,
	emailDomains,
	media,
	messages,
	organizations,
	outboxEvents
} from '$lib/server/db/schema';
import { generateIcs } from '$lib/server/ics/generateIcs';
import type { EmailAttachment } from '$lib/server/email/client';
import { EMAIL_QUEUE, redisConnection } from '$lib/server/queue/bullmq';
import { sendConversationEmail } from '$lib/server/email/conversationEmails';
import { ensureReplyAlias } from '$lib/server/email/replyAlias';
import { r2Get } from '$lib/server/media/r2';
import { createLogger } from '$lib/server/log';

const env = process.env;
const log = createLogger('email.worker');

const MAX_ATTACHMENT_BYTES_TOTAL = 20 * 1024 * 1024; // Resend allows ~40MB; keep headroom.

type EmailJobData = {
	outbox_event_id: string;
	event_type: string;
	org_id: string | null;
	resource_type: string;
	resource_id: string; // message_id
	payload: Record<string, unknown>;
};

/**
 * Permanent failures from Resend / our own validation that should mark the
 * message 'undeliverable' and skip BullMQ retries. Anything else gets retried.
 */
function isPermanentFailure(err: unknown): boolean {
	const msg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
	return (
		(msg.includes('invalid') && msg.includes('recipient')) ||
		msg.includes('suppress') ||
		msg.includes('blocked') ||
		msg.includes('does not exist') ||
		msg.includes('no mx records') ||
		(msg.includes('attachment') && msg.includes('too large'))
	);
}

async function loadAttachments(orgId: string, messageId: string) {
	const rows = await db
		.select({
			id: media.id,
			r2_key: media.r2_key,
			original_filename: media.original_filename,
			mime_type: media.mime_type,
			file_size_bytes: media.file_size_bytes
		})
		.from(media)
		.where(and(eq(media.org_id, orgId), eq(media.message_id, messageId), isNull(media.deleted_at)));

	const totalBytes = rows.reduce((sum, r) => sum + r.file_size_bytes, 0);
	if (totalBytes > MAX_ATTACHMENT_BYTES_TOTAL) {
		throw new Error(
			`Attachment total size ${totalBytes} exceeds limit ${MAX_ATTACHMENT_BYTES_TOTAL}`
		);
	}

	const out = [];
	for (const row of rows) {
		const content = await r2Get(row.r2_key);
		out.push({
			filename: row.original_filename,
			content,
			contentType: row.mime_type
		});
	}
	return out;
}

async function markSending(messageId: string): Promise<boolean> {
	// Atomic transition queued → sending. Returns false if someone else owns it.
	const res = await db
		.update(messages)
		.set({
			status: 'sending',
			send_attempts: 1, // first observed attempt; updated again below if needed
			updated_at: new Date()
		})
		.where(and(eq(messages.id, messageId), eq(messages.status, 'queued')))
		.returning({ id: messages.id });
	return res.length > 0;
}

async function bumpAttempts(messageId: string, attempts: number) {
	await db
		.update(messages)
		.set({ send_attempts: attempts, updated_at: new Date() })
		.where(eq(messages.id, messageId));
}

async function processEmailSend(job: Job<EmailJobData>) {
	const data = job.data;
	const messageId = data.resource_id;

	const [msg] = await db.select().from(messages).where(eq(messages.id, messageId)).limit(1);

	if (!msg) {
		log.warn({ phase: 'message_missing', message_id: messageId });
		return;
	}
	if (msg.channel !== 'email' || msg.direction !== 'outbound') {
		log.warn({
			phase: 'wrong_kind',
			message_id: messageId,
			channel: msg.channel,
			direction: msg.direction
		});
		return;
	}
	if (msg.status !== 'queued' && msg.status !== 'sending' && msg.status !== 'failed') {
		// Already terminal (sent / delivered / bounced / undeliverable). Skip.
		log.info({ phase: 'already_processed', message_id: messageId, status: msg.status });
		return;
	}

	// Transition to sending (idempotent on retries — also accept current 'sending'/'failed').
	if (msg.status === 'queued') {
		const claimed = await markSending(messageId);
		if (!claimed) {
			log.info({ phase: 'claim_lost', message_id: messageId });
			return;
		}
	}
	const attemptNumber = job.attemptsMade + 1;
	if (attemptNumber > 1) await bumpAttempts(messageId, attemptNumber);

	const [conv] = await db
		.select()
		.from(conversations)
		.where(eq(conversations.id, msg.conversation_id))
		.limit(1);
	if (!conv) throw new Error(`Conversation ${msg.conversation_id} not found`);

	const [contact] = await db
		.select({ id: contacts.id, email: contacts.email, full_name: contacts.full_name })
		.from(contacts)
		.where(eq(contacts.id, conv.contact_id))
		.limit(1);
	if (!contact?.email) {
		await db
			.update(messages)
			.set({
				status: 'undeliverable',
				failure_reason: 'Contact has no email address',
				failed_at: new Date(),
				updated_at: new Date()
			})
			.where(eq(messages.id, messageId));
		return;
	}

	const [org] = await db
		.select({
			name: organizations.name,
			slug: organizations.slug,
			email_sender_local: organizations.email_sender_local
		})
		.from(organizations)
		.where(eq(organizations.id, msg.org_id))
		.limit(1);
	if (!org) throw new Error(`Organization ${msg.org_id} not found`);

	// Per-tenant sending/receiving domain. No shared-domain fallback: if the org's
	// Brevo domain isn't verified, the message cannot be sent.
	const [emailDomain] = await db
		.select({
			domain: emailDomains.domain,
			inbound_domain: emailDomains.inbound_domain,
			status: emailDomains.status
		})
		.from(emailDomains)
		.where(eq(emailDomains.org_id, msg.org_id))
		.limit(1);
	if (!emailDomain || emailDomain.status !== 'verified') {
		await db
			.update(messages)
			.set({
				status: 'undeliverable',
				failure_reason: 'Email domain not set up for this organization',
				failed_at: new Date(),
				updated_at: new Date()
			})
			.where(eq(messages.id, messageId));
		return;
	}
	const sendingDomain = emailDomain.domain;
	const inboundDomain = emailDomain.inbound_domain;

	const replyAlias = await ensureReplyAlias(msg.org_id, conv.id);

	let attachments: EmailAttachment[];
	try {
		attachments = await loadAttachments(msg.org_id, messageId);
	} catch (err) {
		const reason = err instanceof Error ? err.message : String(err);
		await db
			.update(messages)
			.set({
				status: 'undeliverable',
				failure_reason: `Attachment load failed: ${reason}`,
				failed_at: new Date(),
				updated_at: new Date()
			})
			.where(eq(messages.id, messageId));
		return;
	}

	// Optional appointment .ics attachment. Prepended so it appears first in the
	// email — most clients surface the topmost .ics as the "Add to calendar"
	// affordance. Best-effort: a generation failure must not block the send.
	const appointmentId =
		typeof data.payload?.appointment_id === 'string' ? data.payload.appointment_id : null;
	if (appointmentId) {
		try {
			const [appt] = await db
				.select({
					id: appointments.id,
					title: appointments.title,
					scheduled_start: appointments.scheduled_start,
					scheduled_end: appointments.scheduled_end,
					location: appointments.location
				})
				.from(appointments)
				.where(eq(appointments.id, appointmentId))
				.limit(1);
			if (appt) {
				const end = appt.scheduled_end ?? new Date(appt.scheduled_start.getTime() + 60 * 60_000);
				const ics = generateIcs({
					uid: `appointment-${appt.id}@${org.slug}`,
					start: appt.scheduled_start,
					end,
					summary: `${appt.title} — ${org.name}`,
					location: appt.location ?? undefined,
					organizerName: org.name,
					customerName: contact.full_name,
					customerEmail: contact.email
				});
				attachments = [ics, ...attachments];
			}
		} catch (err) {
			log.warn({
				phase: 'ics_generation_failed',
				message_id: messageId,
				appointment_id: appointmentId,
				error: err instanceof Error ? err.message : String(err)
			});
		}
	}

	const recipient = msg.email_to_addresses?.[0] ?? contact.email;

	try {
		const result = await sendConversationEmail({
			org,
			sendingDomain,
			inboundDomain,
			replyAlias,
			to: recipient,
			subject: msg.email_subject ?? '',
			body: msg.body ?? '',
			inReplyTo: msg.email_in_reply_to ?? null,
			references: msg.email_references ?? null,
			attachments,
			messageId
		});

		await db.transaction(async (tx) => {
			await tx
				.update(messages)
				.set({
					status: 'sent',
					email_provider: result.provider,
					email_provider_message_id: result.providerMessageId ?? undefined,
					email_from_address: result.fromAddress,
					sent_at: new Date(),
					updated_at: new Date()
				})
				.where(eq(messages.id, messageId));

			await tx.insert(outboxEvents).values({
				org_id: msg.org_id,
				event_type: 'message.sent',
				resource_type: 'message',
				resource_id: messageId,
				payload: {
					message_id: messageId,
					conversation_id: conv.id,
					contact_id: conv.contact_id,
					org_id: msg.org_id,
					channel: 'email',
					email_provider_message_id: result.providerMessageId,
					email_subject: msg.email_subject,
					sent_by: msg.sent_by
				},
				idempotency_key: `message.sent:${messageId}`
			});
		});
	} catch (err) {
		const reason = err instanceof Error ? err.message : String(err);
		const permanent = isPermanentFailure(err);
		log.error({
			phase: 'send_failed',
			message_id: messageId,
			attempt: attemptNumber,
			permanent,
			error: reason
		});

		if (permanent) {
			await db
				.update(messages)
				.set({
					status: 'undeliverable',
					failure_reason: reason,
					failed_at: new Date(),
					updated_at: new Date()
				})
				.where(eq(messages.id, messageId));
			return; // do not throw — no retry
		}

		// Last attempt? Mark failed and stop retrying.
		if (attemptNumber >= (job.opts.attempts ?? 3)) {
			await db
				.update(messages)
				.set({
					status: 'failed',
					failure_reason: reason,
					failed_at: new Date(),
					updated_at: new Date()
				})
				.where(eq(messages.id, messageId));
		}
		throw err;
	}
}

export const emailWorker = new Worker<EmailJobData>(
	EMAIL_QUEUE,
	async (job) => {
		if (job.name !== 'email.send.requested') {
			log.warn({ phase: 'unknown_job', name: job.name });
			return;
		}
		await processEmailSend(job);
	},
	{
		connection: redisConnection(),
		concurrency: Number(env.EMAIL_WORKER_CONCURRENCY ?? '4')
	}
);

emailWorker.on('failed', (job, err) => {
	console.error(`[email] job ${job?.id} (${job?.name}) failed:`, err.message);
});
