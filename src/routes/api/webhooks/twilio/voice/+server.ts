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
import { validateTwilioSignature, reconstructWebhookUrl } from '$lib/server/twilio/client';
import { toE164, PhoneInvalidError } from '$lib/utils/phone';
import { touchContactLastContacted } from '$lib/server/contacts/touchLastContacted';
import {
	findOrCreateOpenConversation,
	recordInboundMessage
} from '$lib/server/conversations';

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

	// Audit raw payload (best-effort).
	void db
		.insert(inboundCommunicationEvents)
		.values({
			org_id: org.id,
			provider: 'twilio',
			provider_event_id: callSid,
			event_type: 'missed_call',
			raw_payload: params,
			processed_at: new Date()
		})
		.catch(() => undefined);

	let touchedContactId: string | null = null;
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

			const { conversation: conv } = await findOrCreateOpenConversation(tx, {
				orgId: org.id,
				contactId,
				createdChannel: 'missed_call'
			});

			const insertedMsg = await recordInboundMessage(tx, {
				orgId: org.id,
				conversationId: conv.id,
				channel: 'missed_call',
				body: 'Missed phone call',
				twilioMessageSid: callSid,
				source: 'webhook'
			});

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

			touchedContactId = contactId;
		});
	} catch (e) {
		const msg = e instanceof Error ? e.message : '';
		if (/unique|duplicate/i.test(msg) && /twilio_message_sid|sid|call/i.test(msg)) {
			return twiml();
		}
		console.error('[twilio voice webhook] transaction failed', e);
		return new Response('Internal error', { status: 500 });
	}

	if (touchedContactId) {
		void touchContactLastContacted(org.id, touchedContactId);
	}

	return twiml();
};
