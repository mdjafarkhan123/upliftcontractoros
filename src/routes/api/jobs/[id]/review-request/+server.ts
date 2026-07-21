import { json, error } from '@sveltejs/kit';
import { and, eq, isNull } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import {
	automationSettings,
	contacts,
	jobs,
	organizations,
	outboxEvents,
	reviewRequests
} from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { canSendReviewRequests } from '$lib/server/reputation/permissions';
import { interpolate } from '$lib/server/workers/templates';
import { queueAutomationSms } from '$lib/server/conversations/queueAutomationSms';
import { generateReviewToken, reviewTokenExpiry } from '$lib/server/reputation/token';
import { buildReviewLink } from '$lib/server/reputation/reviewLink';

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
	// Manual send: the job must be closed as complete (archived + completed_at), never cancelled.
	// (Jobber's automatic review request fires post-payment — that automation is re-anchored to the
	// invoice.paid event separately; this remains the deliberate, on-demand path.)
	if (job.status !== 'archived' || !job.completed_at) {
		return json(
			{ error: 'Job must be completed before sending a review request.' },
			{ status: 422 }
		);
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

	const token = await generateReviewToken();
	const reviewLink = buildReviewLink(token);
	const body = interpolate(settings.review_funnel_message, {
		contact_name: contact.full_name,
		org_name: org.name,
		review_link: reviewLink
	});

	const inserted = await db.transaction(async (tx) => {
		const [row] = await tx
			.insert(reviewRequests)
			.values({
				org_id: auth.orgId,
				job_id: job.id,
				contact_id: contact.id,
				status: 'sent',
				sent_by_automation: false,
				sent_by_member_id: auth.member.id,
				sent_at: new Date(),
				token,
				token_expires_at: reviewTokenExpiry()
			})
			.onConflictDoNothing({ target: reviewRequests.job_id })
			.returning();
		if (!row) return null;

		// Hand off to the unified SMS pipeline. The smsWorker owns Twilio
		// delivery, status callbacks, and the authoritative monthly usage
		// increment — this route must not call sendSms or
		// assertAndIncrementUsage directly.
		await queueAutomationSms(tx, {
			orgId: auth.orgId,
			contactId: contact.id,
			body,
			source: 'manual.review_request'
		});

		// Schedule the 72h reminder via the outbox (delayed dispatch). The
		// automation handler re-checks status/opt-out/settings at fire time.
		if (settings.review_funnel_reminder_enabled) {
			await tx.insert(outboxEvents).values({
				org_id: auth.orgId,
				event_type: 'review_request.sent',
				resource_type: 'review_request',
				resource_id: row.id,
				payload: {
					review_request_id: row.id,
					org_id: auth.orgId,
					job_id: job.id,
					contact_id: contact.id
				},
				idempotency_key: `review_request.sent:${row.id}`
			});
		}

		return row;
	});

	if (!inserted) {
		return json({ error: 'A review request has already been sent for this job.' }, { status: 409 });
	}

	return json({ data: { id: inserted.id } }, { status: 201 });
};
