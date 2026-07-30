import { json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { assertCommunicationPreferenceAccess } from '$lib/server/communication-preferences/access';
import {
	changeCommunicationConsent,
	CommunicationPreferenceMutationError
} from '$lib/server/communication-preferences/mutations';

const consentSchema = z.object({
	channel: z.enum(['all', 'sms', 'email', 'call', 'whatsapp', 'messenger', 'gbp', 'webchat']),
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
	]),
	status: z.enum(['unknown', 'opted_in', 'opted_out', 'revoked']),
	evidence: z.record(z.string(), z.unknown()).optional()
});

function errorResponse(error: unknown) {
	if (error instanceof CommunicationPreferenceMutationError) {
		return json({ error: error.message }, { status: error.status });
	}
	return json({ error: 'Unable to update communication consent.' }, { status: 500 });
}

export const POST: RequestHandler = async ({ locals, params, request }) => {
	const auth = locals.auth;
	assertOrgActive(auth);
	const contactId = params.id;
	if (!contactId) return json({ error: 'Contact not found.' }, { status: 404 });
	try {
		await assertCommunicationPreferenceAccess(auth, contactId, 'write');
		const parsed = consentSchema.safeParse(await request.json());
		if (!parsed.success) {
			return json({ error: 'Invalid communication consent.', field_errors: {} }, { status: 422 });
		}

		const consent = await changeCommunicationConsent({
			orgId: auth.orgId,
			contactId,
			channel: parsed.data.channel,
			category: parsed.data.category,
			status: parsed.data.status,
			source: 'user',
			evidence: parsed.data.evidence
		});
		return json({ data: consent });
	} catch (error) {
		if (error instanceof SyntaxError) return json({ error: 'Invalid JSON body.' }, { status: 400 });
		return errorResponse(error);
	}
};
