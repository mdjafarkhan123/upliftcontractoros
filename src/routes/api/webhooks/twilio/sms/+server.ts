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
import { detectOptKeyword } from '$lib/server/twilio/optOut';
import { stopEnrollmentsForContact } from '$lib/server/automation/engine';
import { changeCommunicationPreferenceInTransaction } from '$lib/server/communication-preferences/mutations';
import { canContactReceiveCommunication } from '$lib/server/communication-preferences';
import { toE164, PhoneInvalidError } from '$lib/utils/phone';
import { touchContactLastContacted } from '$lib/server/contacts/touchLastContacted';
import { findOrCreateOpenConversation, recordInboundMessage } from '$lib/server/conversations';

const TWIML_EMPTY = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';

function twiml(): Response {
	return new Response(TWIML_EMPTY, { status: 200, headers: { 'content-type': 'text/xml' } });
}

export const POST: RequestHandler = async ({ request }) => {
	const url = reconstructWebhookUrl(request);
	const form = await request.formData();
	const params: Record<string, string> = {};
	for (const [k, v] of form.entries()) params[k] = typeof v === 'string' ? v : '';

	const fromRaw = params.From;
	const toRaw = params.To;
	const body = params.Body ?? '';
	const sid = params.MessageSid;

	// Resolve the org that owns the destination number BEFORE validating: an inbound
	// webhook for a subaccount-owned number is signed with that subaccount's auth
	// token (not master). Fall back to master when the org has no subaccount token.
	const [org] = toRaw
		? await db
				.select()
				.from(organizations)
				.where(eq(organizations.twilio_phone_number, toRaw))
				.limit(1)
		: [];

	const signature = request.headers.get('x-twilio-signature');
	if (!validateTwilioSignature(signature, url, params, org?.twilio_subaccount_auth_token)) {
		return new Response('Invalid signature', { status: 403 });
	}

	if (!fromRaw || !toRaw || !sid) return twiml();
	if (!org) return twiml();

	// Inbound MMS media — Twilio sends NumMedia + MediaUrlN/MediaContentTypeN.
	// The URLs are private and expiring, so a worker fetches + stores them; here
	// we only collect them to hand off via the outbox.
	const numMedia = Math.min(parseInt(params.NumMedia ?? '0', 10) || 0, 10);
	const inboundMedia: { url: string; content_type: string }[] = [];
	for (let i = 0; i < numMedia; i++) {
		const url = params[`MediaUrl${i}`];
		if (url) inboundMedia.push({ url, content_type: params[`MediaContentType${i}`] ?? '' });
	}

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

	// Audit raw payload (best-effort — never blocks webhook).
	void db
		.insert(inboundCommunicationEvents)
		.values({
			org_id: org.id,
			provider: 'twilio',
			provider_event_id: sid,
			event_type: 'sms',
			raw_payload: params,
			processed_at: new Date()
		})
		.catch(() => undefined);

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
		await db.transaction(async (tx) => {
			await tx
				.update(contacts)
				.set({
					sms_opt_out: true,
					sms_opt_out_at: new Date(),
					sms_opt_out_source: 'customer_reply',
					updated_at: new Date()
				})
				.where(eq(contacts.id, existingContact.id));
			await changeCommunicationPreferenceInTransaction(tx, {
				orgId: org.id,
				contactId: existingContact.id,
				channel: 'sms',
				direction: 'outbound',
				category: 'all',
				status: 'permanent',
				source: 'customer',
				reasonCode: 'SMS_STOP',
				reasonMessage: 'Contact replied with an opt-out keyword.',
				provider: 'twilio',
				providerEventId: sid,
				metadata: { keyword: optKeyword }
			});
		});
		// Hard stop any active sequence-engine enrollment for this contact (Stage 3.b).
		await stopEnrollmentsForContact(org.id, existingContact.id, 'opt_out');
		return twiml();
	}

	// HighLevel inbound DND blocks SMS before it creates inbox or lead activity.
	// STOP/START remain above this gate so compliance commands can be processed.
	if (existingContact && optKeyword !== 'start') {
		const eligibility = await canContactReceiveCommunication({
			orgId: org.id,
			contactId: existingContact.id,
			channel: 'sms',
			direction: 'inbound',
			category: 'manual_message'
		});
		if (!eligibility.allowed) return twiml();
	}

	// Normal inbound path — wrap business mutations + outbox in one transaction
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
					await changeCommunicationPreferenceInTransaction(tx, {
						orgId: org.id,
						contactId,
						channel: 'sms',
						direction: 'outbound',
						category: 'all',
						status: 'allowed',
						source: 'customer',
						reasonCode: 'SMS_START',
						reasonMessage: 'Contact replied with an opt-in keyword.',
						provider: 'twilio',
						providerEventId: sid,
						allowPermanentClear: true,
						metadata: { keyword: optKeyword }
					});
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
				source: 'webhook',
				hasMedia: inboundMedia.length > 0
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

			if (inboundMedia.length > 0) {
				await tx.insert(outboxEvents).values({
					org_id: org.id,
					event_type: 'message.media.received',
					resource_type: 'message',
					resource_id: insertedMsg.id,
					payload: {
						message_id: insertedMsg.id,
						conversation_id: conv.id,
						contact_id: contactId,
						org_id: org.id,
						media: inboundMedia
					},
					idempotency_key: `message.media.received:${insertedMsg.id}`
				});
			}

			touchedContactId = contactId;
		});
	} catch (e) {
		const msg = e instanceof Error ? e.message : '';
		if (/unique|duplicate/i.test(msg) && /twilio_message_sid|sid/i.test(msg)) {
			return twiml();
		}
		console.error('[twilio sms webhook] transaction failed', e);
		return new Response('Internal error', { status: 500 });
	}

	if (touchedContactId) {
		void touchContactLastContacted(org.id, touchedContactId);
	}

	return twiml();
};
