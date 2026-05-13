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

	const callStatus = params.CallStatus;
	if (callStatus !== 'no-answer' && callStatus !== 'busy') return twiml();

	const fromRaw = params.From;
	const toRaw = params.To;
	const callSid = params.CallSid;
	if (!fromRaw || !toRaw || !callSid) return twiml();

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

	// Idempotency: missed-call dedupe by CallSid stored in twilio_message_sid
	const [existingMsg] = await db
		.select({ id: messages.id })
		.from(messages)
		.where(eq(messages.twilio_message_sid, callSid))
		.limit(1);
	if (existingMsg) return twiml();

	try {
		await db.transaction(async (tx) => {
			let contactId: string;
			let isNewContact = false;

			const [existingContact] = await tx
				.select()
				.from(contacts)
				.where(and(eq(contacts.org_id, org.id), eq(contacts.phone, fromE164)))
				.limit(1);

			if (existingContact) {
				contactId = existingContact.id;
				await tx.insert(outboxEvents).values({
					org_id: org.id,
					event_type: 'contact.duplicate_detected',
					resource_type: 'contact',
					resource_id: contactId,
					payload: {
						contact_id: contactId,
						org_id: org.id,
						phone: fromE164,
						source: 'missed_call'
					},
					idempotency_key: `contact.duplicate_detected:missed_call:${callSid}`
				});
			} else {
				const [inserted] = await tx
					.insert(contacts)
					.values({
						org_id: org.id,
						full_name: fromE164,
						phone: fromE164,
						lead_source: 'missed_call',
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
						origin: 'missed_call'
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
						origin: 'missed_call'
					},
					idempotency_key: `lead.created:${contactId}`
				});
			}

			// Find or create open missed_call conversation
			let [conv] = await tx
				.select()
				.from(conversations)
				.where(
					and(
						eq(conversations.org_id, org.id),
						eq(conversations.contact_id, contactId),
						eq(conversations.channel, 'missed_call'),
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
						channel: 'missed_call',
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
					channel: 'missed_call',
					body: null,
					status: 'received',
					twilio_message_sid: callSid,
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
						channel: 'missed_call'
					},
					idempotency_key: `conversation.created:${conv.id}`
				});
			}

			await tx.insert(outboxEvents).values({
				org_id: org.id,
				event_type: 'call.missed',
				resource_type: 'message',
				resource_id: insertedMsg.id,
				payload: {
					message_id: insertedMsg.id,
					conversation_id: conv.id,
					contact_id: contactId,
					org_id: org.id,
					call_sid: callSid,
					call_status: callStatus,
					from: fromE164,
					to: toRaw,
					is_new_contact: isNewContact
				},
				idempotency_key: `call.missed:${callSid}`
			});
		});
	} catch (e) {
		const msg = e instanceof Error ? e.message : '';
		if (/unique|duplicate/i.test(msg) && /twilio_message_sid|sid|call/i.test(msg)) {
			return twiml();
		}
		console.error('[twilio voice webhook] transaction failed', e);
		return new Response('Internal error', { status: 500 });
	}

	return twiml();
};
