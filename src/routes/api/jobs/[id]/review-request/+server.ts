import { json, error } from '@sveltejs/kit';
import { and, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
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
import { queueAutomationEmail } from '$lib/server/conversations/queueAutomationEmail';
import { generateReviewToken, reviewTokenExpiry } from '$lib/server/reputation/token';
import { buildReviewLink } from '$lib/server/reputation/reviewLink';
import { emitReviewEvent } from '$lib/server/reputation/lifecycle';
import { canContactReceiveCommunication } from '$lib/server/communication-preferences';

const reviewRequestSchema = z.object({
	channels: z
		.array(z.enum(['email', 'sms']))
		.min(1, 'Choose at least one delivery channel.')
		.max(2)
		.refine((channels) => new Set(channels).size === channels.length, 'Choose each channel once.'),
	sms_message: z.string().trim().min(1).max(640).optional(),
	email_subject: z.string().trim().min(1).max(200).optional(),
	email_body: z.string().trim().min(1).max(5000).optional()
});

const EMAIL_SUBJECT_DEFAULT = 'How was your service with {org_name}?';

export const GET: RequestHandler = async (event) => {
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
	if (job.status !== 'archived' || !job.completed_at) {
		return json(
			{ error: 'Job must be completed before sending a review request.' },
			{ status: 422 }
		);
	}

	const [[contact], [org], [settings]] = await Promise.all([
		db
			.select()
			.from(contacts)
			.where(
				and(
					eq(contacts.id, job.contact_id),
					eq(contacts.org_id, auth.orgId),
					isNull(contacts.deleted_at)
				)
			)
			.limit(1),
		db.select().from(organizations).where(eq(organizations.id, auth.orgId)).limit(1),
		db.select().from(automationSettings).where(eq(automationSettings.org_id, auth.orgId)).limit(1)
	]);
	if (!contact) return json({ error: 'Contact not found' }, { status: 422 });
	if (!org || !settings)
		return json({ error: 'Review request settings are missing.' }, { status: 422 });
	if (!contact.receives_review_requests) {
		return json({ error: 'Contact has opted out of review requests.' }, { status: 422 });
	}

	return json({
		data: {
			contact: {
				name: contact.full_name,
				email: contact.email,
				phone: contact.phone,
				sms_opt_out: contact.sms_opt_out || !org.twilio_phone_number
			},
			defaults: {
				sms: settings.review_funnel_message,
				email_subject: EMAIL_SUBJECT_DEFAULT,
				email_body: settings.review_funnel_message
			}
		}
	});
};

export const POST: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!canSendReviewRequests(auth.member)) error(403, 'Forbidden');

	const jobId = event.params.id!;
	let body: unknown;
	try {
		body = await event.request.json();
	} catch {
		return json({ error: 'Invalid JSON body.' }, { status: 400 });
	}
	const parsed = reviewRequestSchema.safeParse(body);
	if (!parsed.success) {
		const field_errors: Record<string, string> = {};
		for (const issue of parsed.error.issues) {
			const field = issue.path.join('.');
			if (field && !field_errors[field]) field_errors[field] = issue.message;
		}
		return json(
			{ error: parsed.error.issues[0]?.message ?? 'Invalid review request.', field_errors },
			{ status: 422 }
		);
	}
	const input = parsed.data;

	const [job] = await db
		.select()
		.from(jobs)
		.where(and(eq(jobs.id, jobId), eq(jobs.org_id, auth.orgId), isNull(jobs.deleted_at)))
		.limit(1);
	if (!job) return json({ error: 'Job not found' }, { status: 404 });
	// Manual send: the job must be closed as complete (archived + completed_at), never cancelled.
	if (job.status !== 'archived' || !job.completed_at) {
		return json(
			{ error: 'Job must be completed before sending a review request.' },
			{ status: 422 }
		);
	}

	const [[contact], [org], [settings]] = await Promise.all([
		db
			.select()
			.from(contacts)
			.where(
				and(
					eq(contacts.id, job.contact_id),
					eq(contacts.org_id, auth.orgId),
					isNull(contacts.deleted_at)
				)
			)
			.limit(1),
		db.select().from(organizations).where(eq(organizations.id, auth.orgId)).limit(1),
		db.select().from(automationSettings).where(eq(automationSettings.org_id, auth.orgId)).limit(1)
	]);
	if (!contact) return json({ error: 'Contact not found' }, { status: 422 });
	if (!org) return json({ error: 'Organization not found.' }, { status: 422 });

	const eligibility = await Promise.all(
		input.channels.map((channel) =>
			canContactReceiveCommunication({
				orgId: auth.orgId,
				contactId: contact.id,
				channel,
				direction: 'outbound',
				category: 'review_request'
			})
		)
	);
	const blocked = eligibility.find((result) => !result.allowed);
	if (blocked)
		return json(
			{ error: blocked.reasonMessage ?? 'This communication is blocked.' },
			{ status: 422 }
		);

	if (!settings) {
		return json({ error: 'Automation settings missing.' }, { status: 422 });
	}

	const token = await generateReviewToken();
	const reviewLink = buildReviewLink(token);
	const variables = {
		contact_name: contact.full_name,
		org_name: org.name,
		review_link: reviewLink
	};
	const smsBody = input.channels.includes('sms')
		? interpolate(input.sms_message ?? settings.review_funnel_message, variables)
		: null;
	const emailSubject = input.channels.includes('email')
		? interpolate(input.email_subject ?? EMAIL_SUBJECT_DEFAULT, variables)
		: null;
	const emailBody = input.channels.includes('email')
		? interpolate(input.email_body ?? settings.review_funnel_message, variables)
		: null;
	if (
		(smsBody && !smsBody.includes(reviewLink)) ||
		(emailSubject && !emailSubject.includes(reviewLink) && !emailBody?.includes(reviewLink))
	) {
		return json({ error: 'The review link must remain in the message.' }, { status: 422 });
	}

	const inserted = await db.transaction(async (tx) => {
		const now = new Date();
		const [row] = await tx
			.insert(reviewRequests)
			.values({
				org_id: auth.orgId,
				job_id: job.id,
				contact_id: contact.id,
				status: 'sent',
				sent_by_automation: false,
				sent_by_member_id: auth.member.id,
				sent_at: now,
				token,
				token_expires_at: reviewTokenExpiry(now)
			})
			.onConflictDoNothing({ target: reviewRequests.job_id })
			.returning();
		if (!row) return null;

		await emitReviewEvent(tx, {
			org_id: auth.orgId,
			review_request_id: row.id,
			type: 'sent',
			meta: {
				source: 'manual',
				channels: input.channels,
				sent_by_member_id: auth.member.id
			}
		});

		await tx.insert(outboxEvents).values({
			org_id: auth.orgId,
			event_type: 'review_request.sent',
			resource_type: 'review_request',
			resource_id: row.id,
			payload: {
				review_request_id: row.id,
				org_id: auth.orgId,
				contact_id: contact.id,
				job_id: job.id,
				channels: input.channels,
				sent_at: now.toISOString(),
				source: 'manual.review_request'
			},
			idempotency_key: `review_request.sent:${row.id}`
		});

		// Delivery is queued inside this transaction; the workers make the external
		// SMS/email calls only after the transaction commits.
		if (smsBody) {
			await queueAutomationSms(tx, {
				orgId: auth.orgId,
				contactId: contact.id,
				body: smsBody,
				source: 'manual.review_request'
			});
		}
		if (emailSubject && emailBody && contact.email) {
			await queueAutomationEmail(tx, {
				orgId: auth.orgId,
				contactId: contact.id,
				contactEmail: contact.email,
				subject: emailSubject,
				body: emailBody,
				source: 'manual.review_request'
			});
		}

		return row;
	});

	if (!inserted) {
		return json({ error: 'A review request has already been sent for this job.' }, { status: 409 });
	}

	return json({ data: { id: inserted.id } }, { status: 201 });
};
