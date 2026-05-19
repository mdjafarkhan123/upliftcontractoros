import { and, desc, eq, isNull } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import {
	automationSettings,
	contacts,
	inboundCommunicationEvents,
	messages,
	organizations,
	outboxEvents,
	privateFeedback,
	reviewRequests,
	reviews
} from '$lib/server/db/schema';
import { validateTwilioSignature, reconstructWebhookUrl } from '$lib/server/twilio/client';
import { detectOptKeyword } from '$lib/server/twilio/optOut';
import { sendSms } from '$lib/server/twilio/sendSms';
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

	// Review funnel digit reply — only fires when an inbound from a known contact
	// is exactly "1".."5" AND the contact has the most-recent unresolved sent
	// review_request. Falls through to generic inbound otherwise.
	const trimmedBody = body.trim();
	const digitMatch = existingContact ? trimmedBody.match(/^[1-5]$/) : null;
	if (digitMatch) {
		const score = Number(digitMatch[0]);
		const [latestRequest] = await db
			.select()
			.from(reviewRequests)
			.where(
				and(
					eq(reviewRequests.org_id, org.id),
					eq(reviewRequests.contact_id, existingContact!.id),
					eq(reviewRequests.status, 'sent'),
					isNull(reviewRequests.deleted_at)
				)
			)
			.orderBy(desc(reviewRequests.created_at))
			.limit(1);

		if (latestRequest) {
			const [orgSettings] = await db
				.select({ google_review_link: automationSettings.google_review_link })
				.from(automationSettings)
				.where(eq(automationSettings.org_id, org.id))
				.limit(1);

			let replyMessage: string | null = null;
			let processed = false;

			try {
				await db.transaction(async (tx) => {
					const [locked] = await tx
						.select()
						.from(reviewRequests)
						.where(eq(reviewRequests.id, latestRequest.id))
						.for('update');
					if (!locked || locked.status !== 'sent') return;

					await tx
						.update(reviewRequests)
						.set({
							status: 'responded',
							response_score: score,
							responded_at: new Date(),
							updated_at: new Date()
						})
						.where(eq(reviewRequests.id, locked.id));

					const { conversation: conv } = await findOrCreateOpenConversation(tx, {
						orgId: org.id,
						contactId: existingContact!.id,
						createdChannel: 'sms'
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
							contact_id: existingContact!.id,
							org_id: org.id,
							channel: 'sms',
							body,
							twilio_message_sid: sid,
							is_new_contact: false
						},
						idempotency_key: `message.received:${insertedMsg.id}`
					});

					if (score >= 4) {
						const link = orgSettings?.google_review_link?.trim() || null;
						const [insertedReview] = await tx
							.insert(reviews)
							.values({
								org_id: org.id,
								job_id: locked.job_id,
								contact_id: locked.contact_id,
								review_request_id: locked.id,
								score,
								platform: 'sms',
								google_review_link_sent: !!link
							})
							.returning();
						await tx.insert(outboxEvents).values({
							org_id: org.id,
							event_type: 'review.received',
							resource_type: 'review',
							resource_id: insertedReview.id,
							payload: {
								review_id: insertedReview.id,
								org_id: org.id,
								job_id: locked.job_id,
								contact_id: locked.contact_id,
								review_request_id: locked.id,
								score,
								summary: `${score}-star review from ${existingContact!.full_name}`
							},
							idempotency_key: `review.received:${locked.id}`
						});
						replyMessage = link
							? `Thanks so much for the ${score}-star review! Would you mind sharing it publicly here? ${link}`
							: `Thanks so much for the ${score}-star review — we really appreciate it!`;
					} else {
						const [insertedFeedback] = await tx
							.insert(privateFeedback)
							.values({
								org_id: org.id,
								job_id: locked.job_id,
								contact_id: locked.contact_id,
								review_request_id: locked.id,
								score
							})
							.returning();
						await tx.insert(outboxEvents).values({
							org_id: org.id,
							event_type: 'private_feedback.received',
							resource_type: 'private_feedback',
							resource_id: insertedFeedback.id,
							payload: {
								private_feedback_id: insertedFeedback.id,
								org_id: org.id,
								job_id: locked.job_id,
								contact_id: locked.contact_id,
								review_request_id: locked.id,
								score,
								summary: `${score}-star feedback from ${existingContact!.full_name}`
							},
							idempotency_key: `private_feedback.received:${locked.id}`
						});
						replyMessage = `Thank you for the honest feedback — we're sorry we missed the mark. Someone from our team will reach out shortly to make it right.`;
					}
					processed = true;
				});
			} catch (e) {
				const msg = e instanceof Error ? e.message : '';
				if (/unique|duplicate/i.test(msg)) return twiml();
				console.error('[twilio sms webhook] review reply transaction failed', e);
				return new Response('Internal error', { status: 500 });
			}

			if (processed) {
				void touchContactLastContacted(org.id, existingContact!.id);
			}

			if (processed && replyMessage && !existingContact!.sms_opt_out) {
				try {
					await sendSms(org.twilio_phone_number, existingContact!.phone, replyMessage);
					void touchContactLastContacted(org.id, existingContact!.id);
				} catch (e) {
					console.error('[twilio sms webhook] review reply SMS send failed', e);
				}
			}
			return twiml();
		}
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
				createdChannel: 'sms'
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
