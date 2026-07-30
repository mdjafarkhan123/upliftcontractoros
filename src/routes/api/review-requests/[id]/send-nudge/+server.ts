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
import { emitReviewEvent } from '$lib/server/reputation/lifecycle';
import { canContactReceiveCommunication } from '$lib/server/communication-preferences';

// Manual engaged-stream nudge. Mirrors `runNudge()` in automationWorker:
// the UPDATE WHERE nudge_count = expected guard makes this safe to fire even
// if the BullMQ-scheduled nudge later runs — the worker's own guard will
// no-op because nudge_count has already advanced.
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
	if (rr.status !== 'engaged') {
		return json({ error: 'Nudges can only be sent on engaged review requests.' }, { status: 422 });
	}
	if (rr.nudge_count >= 2) {
		return json({ error: 'Maximum nudges already sent for this request.' }, { status: 422 });
	}
	if (!rr.token) {
		return json({ error: 'Review request is missing its link token.' }, { status: 422 });
	}

	const expectedCount = rr.nudge_count as 0 | 1;
	const nudgeNumber: 1 | 2 = (expectedCount + 1) as 1 | 2;

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
	const eligibility = await canContactReceiveCommunication({
		orgId: auth.orgId,
		contactId: contact.id,
		channel: 'sms',
		direction: 'outbound',
		category: 'review_request'
	});
	if (!eligibility.allowed)
		return json(
			{ error: eligibility.reasonMessage ?? 'This communication is blocked.' },
			{ status: 422 }
		);

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
	if (!settings || !settings.review_funnel_enabled) {
		return json({ error: 'Review funnel is disabled.' }, { status: 422 });
	}

	const template =
		nudgeNumber === 1
			? settings.review_funnel_nudge_1_message
			: settings.review_funnel_nudge_2_message;

	const reviewLink = buildReviewLink(rr.token);
	const body = interpolate(template, {
		contact_name: contact.full_name,
		org_name: org.name,
		review_link: reviewLink
	});

	const claimed = await db.transaction<boolean>(async (tx) => {
		const updated = await tx
			.update(reviewRequests)
			.set({ nudge_count: expectedCount + 1, updated_at: new Date() })
			.where(
				and(
					eq(reviewRequests.id, rr.id),
					eq(reviewRequests.status, 'engaged'),
					eq(reviewRequests.nudge_count, expectedCount)
				)
			)
			.returning({ id: reviewRequests.id });
		if (updated.length === 0) return false;

		await queueAutomationSms(tx, {
			orgId: auth.orgId,
			contactId: contact.id,
			body,
			source: `manual.review.nudge_${nudgeNumber}`
		});
		await emitReviewEvent(tx, {
			org_id: auth.orgId,
			review_request_id: rr.id,
			type: 'nudge_sent',
			nudge_number: nudgeNumber
		});
		return true;
	});

	if (!claimed) {
		return json({ error: 'Nudge could not be sent — the request state changed.' }, { status: 409 });
	}

	return new Response(null, { status: 204 });
};
