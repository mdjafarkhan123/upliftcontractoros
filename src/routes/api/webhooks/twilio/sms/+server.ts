import { and, eq, isNull } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import {
	contacts,
	conversations,
	messages,
	organizations,
	outboxEvents
} from '$lib/server/db/schema';
import { validateTwilioSignature, reconstructWebhookUrl } from '$lib/server/twilio/client';
import { detectOptKeyword } from '$lib/server/twilio/optOut';
import { toE164, PhoneInvalidError } from '$lib/utils/phone';

const TWIML_EMPTY = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';

function twiml(): Response {
	return new Response(TWIML_EMPTY, { status: 200, headers: { 'content-type': 'text/xml' } });
}

export const POST: RequestHandler = async ({ request }) => {
	const url = reconstructWebhookUrl(request);
	const form = await request.formData();
	const params: Record<string, string> = {};
	for (const [k, v] of form.entries()) params[k] = typeof v === 'string' ? v : '';

	const signature = request.headers.get('x-twilio-signature');
	if (!validateTwilioSignature(signature, url, params)) {
		return new Response('Invalid signature', { status: 403 });
	}

	const fromRaw = params.From;
	const toRaw = params.To;
	const body = params.Body ?? '';
	const sid = params.MessageSid;

	if (!fromRaw || !toRaw || !sid) return twiml();

	// Idempotency: if we have already stored this SID, return 200 silently
	const [existingMsg] = await db
		.select({ id: messages.id })
		.from(messages)
		.where(eq(messages.twilio_message_sid, sid))
		.limit(1);
	if (existingMsg) return twiml();

	let fromE164: string;
	try {
		fromE164 = toE164(fromRaw);
	} catch (e) {
		if (e instanceof PhoneInvalidError) return twiml();
		throw e;
	}

	const [org] = await db
		.select()
		.from(organizations)
		.where(eq(organizations.twilio_phone_number, toRaw))
		.limit(1);
	if (!org) return twiml();

	const optKeyword = detectOptKeyword(body);

	const [existingContact] = await db
		.select()
		.from(contacts)
		.where(and(eq(contacts.org_id, org.id), eq(contacts.phone, fromE164)))
		.limit(1);

	// STOP from unknown number → silent 200, no contact, no events
	if (optKeyword === 'stop' && !existingContact) return twiml();

	// STOP from known contact → apply opt-out, no events, no message stored
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
		return twiml();
	}

	// Normal inbound path — wrap business mutations + outbox in one transaction
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

			// Find or create open SMS conversation. Unique index
			// idx_conversations_open_contact_channel guarantees at most one open
			// per (contact_id, channel).
			let [conv] = await tx
				.select()
				.from(conversations)
				.where(
					and(
						eq(conversations.org_id, org.id),
						eq(conversations.contact_id, contactId),
						eq(conversations.channel, 'sms'),
						eq(conversations.status, 'open'),
						isNull(conversations.deleted_at)
					)
				)
				.limit(1);

			let convCreated = false;
			if (!conv) {
				const [created] = await tx
					.insert(conversations)
					.values({
						org_id: org.id,
						contact_id: contactId,
						channel: 'sms',
						status: 'open',
						last_message_at: new Date(),
						unread_count: 0
					})
					.returning();
				conv = created;
				convCreated = true;
			}

			const [insertedMsg] = await tx
				.insert(messages)
				.values({
					org_id: org.id,
					conversation_id: conv.id,
					direction: 'inbound',
					channel: 'sms',
					body,
					status: 'received',
					twilio_message_sid: sid,
					sent_at: new Date()
				})
				.returning();

			await tx
				.update(conversations)
				.set({
					last_message_at: new Date(),
					unread_count: (conv.unread_count ?? 0) + 1,
					updated_at: new Date()
				})
				.where(eq(conversations.id, conv.id));

			if (convCreated) {
				await tx.insert(outboxEvents).values({
					org_id: org.id,
					event_type: 'conversation.created',
					resource_type: 'conversation',
					resource_id: conv.id,
					payload: {
						conversation_id: conv.id,
						org_id: org.id,
						contact_id: contactId,
						channel: 'sms'
					},
					idempotency_key: `conversation.created:${conv.id}`
				});
			}

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
		});
	} catch (e) {
		// Unique violation on twilio_message_sid → another concurrent webhook delivery
		// of the same SID already won the race. Treat as success.
		const msg = e instanceof Error ? e.message : '';
		if (/unique|duplicate/i.test(msg) && /twilio_message_sid|sid/i.test(msg)) {
			return twiml();
		}
		console.error('[twilio sms webhook] transaction failed', e);
		// Return 500 so Twilio retries
		return new Response('Internal error', { status: 500 });
	}

	return twiml();
};
