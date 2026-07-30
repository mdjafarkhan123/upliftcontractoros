import { json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import {
	changeCommunicationPreference,
	listCommunicationPreferences,
	CommunicationPreferenceMutationError
} from '$lib/server/communication-preferences/mutations';
import { assertCommunicationPreferenceAccess } from '$lib/server/communication-preferences/access';

const scopeSchema = z.object({
	channel: z.enum(['all', 'sms', 'email', 'call', 'whatsapp', 'messenger', 'gbp', 'webchat']),
	direction: z.enum(['all', 'inbound', 'outbound']),
	category: z.enum([
		'all',
		'manual_message',
		'marketing',
		'speed_to_lead',
		'quote_send',
		'quote_followup',
		'invoice_send',
		'invoice_reminder',
		'appointment_confirmation',
		'appointment_reminder',
		'job_scheduled',
		'job_on_my_way',
		'payment_receipt',
		'review_request',
		'private_feedback_recovery'
	])
});

const preferenceMutationSchema = scopeSchema.extend({
	action: z.enum(['enable', 'disable']),
	reason_code: z.string().trim().max(120).optional(),
	reason_message: z.string().trim().max(500).optional(),
	metadata: z.record(z.string(), z.unknown()).optional()
});

function mutationErrorResponse(error: unknown) {
	if (error instanceof CommunicationPreferenceMutationError) {
		return json({ error: error.message }, { status: error.status });
	}
	return json({ error: 'Unable to update communication preference.' }, { status: 500 });
}

export const GET: RequestHandler = async ({ locals, params }) => {
	const auth = locals.auth;
	assertOrgActive(auth);
	const contactId = params.id;
	if (!contactId) return json({ error: 'Contact not found.' }, { status: 404 });
	try {
		await assertCommunicationPreferenceAccess(auth, contactId, 'read');
		return json({ data: await listCommunicationPreferences(auth.orgId, contactId) });
	} catch (error) {
		return mutationErrorResponse(error);
	}
};

export const POST: RequestHandler = async ({ locals, params, request }) => {
	const auth = locals.auth;
	assertOrgActive(auth);
	const contactId = params.id;
	if (!contactId) return json({ error: 'Contact not found.' }, { status: 404 });
	try {
		await assertCommunicationPreferenceAccess(auth, contactId, 'write');
		const parsed = preferenceMutationSchema.safeParse(await request.json());
		if (!parsed.success) {
			return json(
				{ error: 'Invalid communication preference.', field_errors: {} },
				{ status: 422 }
			);
		}

		const result = await changeCommunicationPreference({
			orgId: auth.orgId,
			contactId,
			channel: parsed.data.channel,
			direction: parsed.data.direction,
			category: parsed.data.category,
			status: parsed.data.action === 'disable' ? 'blocked' : 'allowed',
			source: 'user',
			actorMemberId: auth.member.id,
			reasonCode: parsed.data.reason_code ?? 'USER_DND_ACTION',
			reasonMessage: parsed.data.reason_message,
			metadata: parsed.data.metadata
		});

		return json({ data: result });
	} catch (error) {
		if (error instanceof SyntaxError) {
			return json({ error: 'Invalid JSON body.' }, { status: 400 });
		}
		return mutationErrorResponse(error);
	}
};
