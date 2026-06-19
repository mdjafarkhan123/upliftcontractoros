import { and, eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import {
	contacts,
	inboundCommunicationEvents,
	messages,
	organizations,
	outboxEvents
} from '$lib/server/db/schema';
import { verifyTelnyxSignature } from '$lib/server/telnyx/client';
import { detectOptKeyword } from '$lib/server/twilio/optOut';
import { stopEnrollmentsForContact } from '$lib/server/automation/engine';
import { toE164, PhoneInvalidError } from '$lib/utils/phone';
import { touchContactLastContacted } from '$lib/server/contacts/touchLastContacted';
import { findOrCreateOpenConversation, recordInboundMessage } from '$lib/server/conversations';
import { createLogger } from '$lib/server/log';

const log = createLogger('telnyx.webhook');

// Forward-only delivery status rank (same logic as Twilio status handler)
const STATE_RANK: Record<string, number> = {
	queued: 1,
	sending: 2,
	sent: 3,
	delivered: 4,
	failed: 5,
	undeliverable: 5
};

function mapTelnyxStatus(
	s: string
): 'queued' | 'sending' | 'sent' | 'delivered' | 'failed' | 'undeliverable' | null {
	switch (s) {
		case 'queued':
			return 'queued';
		case 'sending':
			return 'sending';
		case 'sent':
			return 'sent';
		case 'delivered':
			return 'delivered';
		case 'delivery_failed':
		case 'failed':
			return 'failed';
		case 'delivery_unconfirmed':
			return 'undeliverable';
		default:
			return null;
	}
}

export const POST: RequestHandler = async ({ request }) => {
	const rawBody = await request.text();

	const signature = request.headers.get('telnyx-signature-ed25519-signature') ?? '';
	const timestamp = request.headers.get('telnyx-signature-ed25519-timestamp') ?? '';

	if (!verifyTelnyxSignature(rawBody, signature, timestamp)) {
		log.warn({ phase: 'invalid_signature' });
		return new Response('Invalid signature', { status: 403 });
	}

	let payload: TelnyxWebhookPayload;
	try {
		payload = JSON.parse(rawBody);
	} catch {
		return new Response('Bad JSON', { status: 400 });
	}

	const eventType = payload?.data?.event_type;
	const data = payload?.data?.payload;
	if (!eventType || !data) return new Response(null, { status: 204 });

	if (eventType === 'message.received') {
		return handleInbound(data);
	}

	if (eventType === 'message.sent' || eventType === 'message.finalized') {
		return handleStatus(data, eventType);
	}

	// Unknown event — ack silently
	return new Response(null, { status: 204 });
};

// ---------------------------------------------------------------------------
// Inbound SMS handler
// ---------------------------------------------------------------------------

async function handleInbound(data: TelnyxMessagePayload): Promise<Response> {
	const fromRaw = data.from?.phone_number;
	const toRaw = data.to?.[0]?.phone_number;
	const body = data.text ?? '';
	const sid = data.id; // Telnyx message ID — stored in twilio_message_sid for idempotency

	if (!fromRaw || !toRaw || !sid) return new Response(null, { status: 204 });

	// Idempotency — already processed
	const [existingMsg] = await db
		.select({ id: messages.id })
		.from(messages)
		.where(eq(messages.twilio_message_sid, sid))
		.limit(1);
	if (existingMsg) return new Response(null, { status: 204 });

	let fromE164: string;
	try {
		fromE164 = toE164(fromRaw);
	} catch (e) {
		if (e instanceof PhoneInvalidError) return new Response(null, { status: 204 });
		throw e;
	}

	// Look up org by the receiving phone number
	const [org] = await db
		.select()
		.from(organizations)
		.where(eq(organizations.twilio_phone_number, toRaw))
		.limit(1);
	if (!org) {
		log.warn({ phase: 'no_org_match', to: toRaw });
		return new Response(null, { status: 204 });
	}

	// Audit raw payload (best-effort — never blocks webhook)
	void db
		.insert(inboundCommunicationEvents)
		.values({
			org_id: org.id,
			provider: 'telnyx',
			provider_event_id: sid,
			event_type: 'sms',
			raw_payload: data as Record<string, unknown>,
			processed_at: new Date()
		})
		.catch(() => undefined);

	const optKeyword = detectOptKeyword(body);

	const [existingContact] = await db
		.select()
		.from(contacts)
		.where(and(eq(contacts.org_id, org.id), eq(contacts.phone, fromE164)))
		.limit(1);

	// STOP from unknown number → silent 200
	if (optKeyword === 'stop' && !existingContact) return new Response(null, { status: 204 });

	// STOP from known contact → apply opt-out
	if (optKeyword === 'stop' && existingContact) {
		await db
			.update(contacts)
			.set({
				sms_opt_out: true,
				sms_opt_out_at: new Date(),
				sms_opt_out_source: 'customer_reply',
				updated_at: new Date()
			})
			.where(eq(contacts.id, existingContact.id));
		// Hard stop any active sequence-engine enrollment for this contact (Stage 3.b).
		await stopEnrollmentsForContact(org.id, existingContact.id, 'opt_out');
		return new Response(null, { status: 204 });
	}

	let touchedContactId: string | null = null;
	try {
		await db.transaction(async (tx) => {
			let contactId: string;
			let isNewContact = false;
			let wasReOptIn = false;

			if (existingContact) {
				contactId = existingContact.id;
				if (optKeyword === 'start' && existingContact.sms_opt_out) {
					await tx
						.update(contacts)
						.set({
							sms_opt_out: false,
							sms_opt_out_at: null,
							sms_opt_out_source: null,
							sms_opted_in_at: new Date(),
							updated_at: new Date()
						})
						.where(eq(contacts.id, contactId));
					wasReOptIn = true;
				}
				await tx.insert(outboxEvents).values({
					org_id: org.id,
					event_type: 'contact.duplicate_detected',
					resource_type: 'contact',
					resource_id: contactId,
					payload: {
						contact_id: contactId,
						org_id: org.id,
						phone: fromE164,
						source: 'sms_inbound'
					},
					idempotency_key: `contact.duplicate_detected:sms:${sid}`
				});
			} else {
				const [inserted] = await tx
					.insert(contacts)
					.values({
						org_id: org.id,
						full_name: fromE164,
						phone: fromE164,
						lead_source: 'other',
						status: 'lead'
					})
					.returning();
				contactId = inserted.id;
				isNewContact = true;
				await tx.insert(outboxEvents).values({
					org_id: org.id,
					event_type: 'contact.created',
					resource_type: 'contact',
					resource_id: contactId,
					payload: {
						contact_id: contactId,
						org_id: org.id,
						full_name: inserted.full_name,
						phone: inserted.phone,
						lead_source: inserted.lead_source,
						origin: 'sms_inbound'
					},
					idempotency_key: `contact.created:${contactId}`
				});
				await tx.insert(outboxEvents).values({
					org_id: org.id,
					event_type: 'lead.created',
					resource_type: 'contact',
					resource_id: contactId,
					payload: {
						contact_id: contactId,
						org_id: org.id,
						lead_source: inserted.lead_source,
						origin: 'sms_inbound'
					},
					idempotency_key: `lead.created:${contactId}`
				});
			}

			if (wasReOptIn) {
				await tx.insert(outboxEvents).values({
					org_id: org.id,
					event_type: 'contact.sms_opted_in',
					resource_type: 'contact',
					resource_id: contactId,
					payload: { contact_id: contactId, org_id: org.id, source: 'customer_reply' },
					idempotency_key: `contact.sms_opted_in:${contactId}:${sid}`
				});
			}

			const { conversation: conv } = await findOrCreateOpenConversation(tx, {
				orgId: org.id,
				contactId,
				createdChannel: 'sms',
				reactivate: true
			});

			const insertedMsg = await recordInboundMessage(tx, {
				orgId: org.id,
				conversationId: conv.id,
				channel: 'sms',
				body,
				twilioMessageSid: sid,
				source: 'webhook'
			});

			await tx.insert(outboxEvents).values({
				org_id: org.id,
				event_type: 'message.received',
				resource_type: 'message',
				resource_id: insertedMsg.id,
				payload: {
					message_id: insertedMsg.id,
					conversation_id: conv.id,
					contact_id: contactId,
					org_id: org.id,
					channel: 'sms',
					body,
					twilio_message_sid: sid,
					is_new_contact: isNewContact
				},
				idempotency_key: `message.received:${insertedMsg.id}`
			});

			touchedContactId = contactId;
		});
	} catch (e) {
		const msg = e instanceof Error ? e.message : '';
		if (/unique|duplicate/i.test(msg) && /twilio_message_sid|sid/i.test(msg)) {
			return new Response(null, { status: 204 });
		}
		log.error({ phase: 'inbound_transaction_failed', error: msg });
		return new Response('Internal error', { status: 500 });
	}

	if (touchedContactId) {
		void touchContactLastContacted(org.id, touchedContactId);
	}

	return new Response(null, { status: 204 });
}

// ---------------------------------------------------------------------------
// Delivery status handler
// ---------------------------------------------------------------------------

async function handleStatus(data: TelnyxMessagePayload, eventType: string): Promise<Response> {
	const sid = data.id;
	if (!sid) return new Response(null, { status: 204 });

	// Telnyx puts the final status on each recipient entry in `to[]`
	const telnyxStatus = data.to?.[0]?.status ?? eventType.replace('message.', '');
	const mapped = mapTelnyxStatus(telnyxStatus);

	if (!mapped) {
		log.info({ phase: 'unhandled_status', status: telnyxStatus, sid });
		return new Response(null, { status: 204 });
	}

	const [msg] = await db
		.select()
		.from(messages)
		.where(eq(messages.twilio_message_sid, sid))
		.limit(1);
	if (!msg) return new Response(null, { status: 204 });

	// Per-event idempotency
	const eventKey = `telnyx:${sid}:${telnyxStatus}`;
	const [existing] = await db
		.select({ id: inboundCommunicationEvents.id })
		.from(inboundCommunicationEvents)
		.where(
			and(
				eq(inboundCommunicationEvents.provider, 'telnyx'),
				eq(inboundCommunicationEvents.provider_event_id, eventKey)
			)
		)
		.limit(1);
	if (existing) return new Response(null, { status: 204 });

	const now = new Date();
	const currentRank = STATE_RANK[msg.status] ?? 0;
	const nextRank = STATE_RANK[mapped] ?? 0;
	const isFailure = mapped === 'failed' || mapped === 'undeliverable';
	const wasFailure =
		msg.status === 'failed' || msg.status === 'bounced' || msg.status === 'undeliverable';
	const shouldUpdate = isFailure || nextRank > currentRank;
	const shouldEmitFailure = isFailure && shouldUpdate && !wasFailure;

	await db.transaction(async (tx) => {
		if (shouldUpdate) {
			const update: Record<string, unknown> = { status: mapped, updated_at: now };
			if (mapped === 'delivered' && !msg.delivered_at) update.delivered_at = now;
			if (isFailure) {
				update.failed_at = now;
				const errDetail = data.errors?.[0];
				update.failure_reason = errDetail
					? `Telnyx ${errDetail.code}: ${errDetail.title}`
					: `Telnyx reported ${telnyxStatus}`;
			}
			await tx.update(messages).set(update).where(eq(messages.id, msg.id));
		}

		if (shouldEmitFailure) {
			const errDetail = data.errors?.[0];
			const failureReason = errDetail
				? `Telnyx ${errDetail.code}: ${errDetail.title}`
				: `Telnyx reported ${telnyxStatus}`;
			await tx.insert(outboxEvents).values({
				org_id: msg.org_id,
				event_type: 'message.delivery_failed',
				resource_type: 'message',
				resource_id: msg.id,
				payload: {
					message_id: msg.id,
					conversation_id: msg.conversation_id,
					channel: msg.channel,
					status: mapped,
					is_terminal: mapped === 'undeliverable',
					failure_reason: failureReason,
					sent_by: msg.sent_by,
					failed_at: now.toISOString()
				},
				idempotency_key: `message.delivery_failed:${msg.id}:${now.getTime()}`
			});
		}

		await tx
			.insert(inboundCommunicationEvents)
			.values({
				org_id: msg.org_id,
				provider: 'telnyx',
				provider_event_id: eventKey,
				event_type: 'status',
				raw_payload: data as Record<string, unknown>,
				processed_at: now
			})
			.onConflictDoNothing();
	});

	return new Response(null, { status: 204 });
}

// ---------------------------------------------------------------------------
// Telnyx webhook payload types (minimal — only fields we use)
// ---------------------------------------------------------------------------

interface TelnyxWebhookPayload {
	data: {
		event_type: string;
		id: string;
		payload: TelnyxMessagePayload;
	};
}

interface TelnyxMessagePayload {
	id: string;
	direction?: string;
	from?: { phone_number: string };
	to?: Array<{ phone_number: string; status?: string }>;
	text?: string;
	errors?: Array<{ code: string; title: string }>;
}
