import { json, error } from '@sveltejs/kit';
import { and, eq, isNull } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import {
	automationSettings,
	contacts,
	jobs,
	organizations,
	reviewRequests
} from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { canSendReviewRequests } from '$lib/server/reputation/permissions';
import { sendSms } from '$lib/server/twilio/sendSms';
import { interpolate } from '$lib/server/workers/templates';

export const POST: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!canSendReviewRequests(auth.member)) error(403, 'Forbidden');

	const jobId = event.params.id!;

	const [job] = await db
		.select()
		.from(jobs)
		.where(and(eq(jobs.id, jobId), eq(jobs.org_id, auth.orgId), isNull(jobs.deleted_at)))
		.limit(1);
	if (!job) return json({ error: 'Job not found' }, { status: 404 });
	if (job.status !== 'completed') {
		return json({ error: 'Job must be completed before sending a review request.' }, { status: 422 });
	}

	const [contact] = await db
		.select()
		.from(contacts)
		.where(
			and(
				eq(contacts.id, job.contact_id),
				eq(contacts.org_id, auth.orgId),
				isNull(contacts.deleted_at)
			)
		)
		.limit(1);
	if (!contact) return json({ error: 'Contact not found' }, { status: 422 });
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

	const [inserted] = await db
		.insert(reviewRequests)
		.values({
			org_id: auth.orgId,
			job_id: job.id,
			contact_id: contact.id,
			status: 'sent',
			sent_by_automation: false,
			sent_by_member_id: auth.member.id,
			sent_at: new Date()
		})
		.onConflictDoNothing({ target: reviewRequests.job_id })
		.returning();

	if (!inserted) {
		return json({ error: 'A review request has already been sent for this job.' }, { status: 409 });
	}

	const body = interpolate(settings.review_funnel_message, {
		contact_name: contact.full_name,
		org_name: org.name
	});

	try {
		await sendSms(org.twilio_phone_number, contact.phone, body);
	} catch (e) {
		console.error('[review-request] SMS send failed', e);
		// Mark as failed so the UI reflects state; row already exists.
		await db
			.update(reviewRequests)
			.set({ status: 'failed', updated_at: new Date() })
			.where(eq(reviewRequests.id, inserted.id));
		return json({ error: 'Failed to send SMS.' }, { status: 502 });
	}

	return json({ data: { id: inserted.id } }, { status: 201 });
};
