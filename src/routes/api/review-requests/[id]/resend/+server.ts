import { json, error } from '@sveltejs/kit';
import { and, eq, isNull } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { automationSettings, contacts, organizations, reviewRequests } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { canSendReviewRequests } from '$lib/server/reputation/permissions';
import { interpolate } from '$lib/server/workers/templates';
import { queueAutomationSms } from '$lib/server/conversations/queueAutomationSms';
import { buildReviewLink } from '$lib/server/reputation/reviewLink';

// Manual resend of the original review-request SMS for rows in `sent` status.
// Reuses the existing token. Does not change `status`, `sent_at`, or
// `token_expires_at` — the 14d expiry window keeps ticking from the original
// dispatch. No review_event is emitted (no matching enum value).
export const POST: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!canSendReviewRequests(auth.member)) error(403, 'Forbidden');

	const id = event.params.id!;

	const [rr] = await db
		.select()
		.from(reviewRequests)
		.where(
			and(
				eq(reviewRequests.id, id),
				eq(reviewRequests.org_id, auth.orgId),
				isNull(reviewRequests.deleted_at)
			)
		)
		.limit(1);

	if (!rr) return json({ error: 'Review request not found.' }, { status: 404 });
	if (rr.status !== 'sent') {
		return json(
			{ error: 'Only review requests waiting for a response can be resent.' },
			{ status: 422 }
		);
	}
	if (!rr.token) {
		return json({ error: 'Review request is missing its link token.' }, { status: 422 });
	}

	const [contact] = await db
		.select()
		.from(contacts)
		.where(
			and(
				eq(contacts.id, rr.contact_id),
				eq(contacts.org_id, auth.orgId),
				isNull(contacts.deleted_at)
			)
		)
		.limit(1);
	if (!contact) return json({ error: 'Contact not found.' }, { status: 422 });
	if (contact.sms_opt_out) {
		return json({ error: 'Contact has opted out of SMS.' }, { status: 422 });
	}

	const [org] = await db
		.select()
		.from(organizations)
		.where(eq(organizations.id, auth.orgId))
		.limit(1);
	if (!org?.twilio_phone_number) {
		return json({ error: 'Organization SMS is not configured.' }, { status: 422 });
	}

	const [settings] = await db
		.select()
		.from(automationSettings)
		.where(eq(automationSettings.org_id, auth.orgId))
		.limit(1);
	if (!settings) {
		return json({ error: 'Automation settings missing.' }, { status: 422 });
	}

	const reviewLink = buildReviewLink(rr.token);
	const body = interpolate(settings.review_funnel_message, {
		contact_name: contact.full_name,
		org_name: org.name,
		review_link: reviewLink
	});

	await db.transaction(async (tx) => {
		await queueAutomationSms(tx, {
			orgId: auth.orgId,
			contactId: contact.id,
			body,
			source: 'manual.review_request.resend'
		});
	});

	return new Response(null, { status: 204 });
};
