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
	type AutomationSettings,
	type Contact,
	type Job,
	type Organization
} from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { interpolate } from '$lib/server/workers/templates';
import { queueAutomationSms } from '$lib/server/conversations/queueAutomationSms';
import { queueAutomationEmail } from '$lib/server/conversations/queueAutomationEmail';
import { canContactReceiveCommunication } from '$lib/server/communication-preferences';

// Manual, one-tap "on my way" customer alert. Mirrors the review-request flow: a
// contractor-triggered message that hands off directly to the unified SMS/email
// pipeline (no outbox automation handler — this is not a system event). The
// contractor picks the channel(s) in the confirm dialog; GET returns the rendered
// preview + per-channel reachability so the dialog can gate the picker, and POST
// re-validates server-side and returns field_errors per the API contract.

type Ctx = {
	job: Job;
	contact: Contact;
	org: Organization;
	settings: AutomationSettings;
};

async function loadContext(
	orgId: string,
	jobId: string
): Promise<{ ctx: Ctx } | { errorResponse: Response }> {
	const [job] = await db
		.select()
		.from(jobs)
		.where(and(eq(jobs.id, jobId), eq(jobs.org_id, orgId), isNull(jobs.deleted_at)))
		.limit(1);
	if (!job) return { errorResponse: json({ error: 'Job not found' }, { status: 404 }) };

	const [contact] = await db
		.select()
		.from(contacts)
		.where(
			and(eq(contacts.id, job.contact_id), eq(contacts.org_id, orgId), isNull(contacts.deleted_at))
		)
		.limit(1);
	if (!contact) return { errorResponse: json({ error: 'Contact not found' }, { status: 422 }) };

	const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);
	if (!org) return { errorResponse: json({ error: 'Organization not found' }, { status: 422 }) };

	const [settings] = await db
		.select()
		.from(automationSettings)
		.where(eq(automationSettings.org_id, orgId))
		.limit(1);
	if (!settings)
		return { errorResponse: json({ error: 'Automation settings missing.' }, { status: 422 }) };

	return { ctx: { job, contact, org, settings } };
}

function templateVars(ctx: Ctx) {
	return {
		contact_name: ctx.contact.full_name,
		org_name: ctx.org.name,
		job_title: ctx.job.title
	};
}

// GET — preview + reachability for the confirm dialog.
export const GET: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!auth.member.can_send_messages) error(403, 'Forbidden');

	const loaded = await loadContext(auth.orgId, event.params.id!);
	if ('errorResponse' in loaded) return loaded.errorResponse;
	const { ctx } = loaded;

	const vars = templateVars(ctx);
	const smsReason = !ctx.org.twilio_phone_number
		? "Texting isn't set up for your business."
		: !ctx.contact.phone
			? 'No phone number on file.'
			: ctx.contact.sms_opt_out
				? 'Customer opted out of texts.'
				: null;
	const emailReason = !ctx.contact.email ? 'No email address on file.' : null;

	return json({
		data: {
			enabled: ctx.settings.job_on_my_way_enabled,
			job_closed: ctx.job.status === 'archived',
			contact_name: ctx.contact.full_name,
			channels: {
				sms: { available: smsReason === null, reason: smsReason },
				email: { available: emailReason === null, reason: emailReason }
			},
			preview: {
				sms_body: interpolate(ctx.settings.job_on_my_way_sms_message, vars),
				email_subject: interpolate(ctx.settings.job_on_my_way_email_subject, vars),
				email_body: interpolate(ctx.settings.job_on_my_way_email_message, vars)
			}
		}
	});
};

const bodySchema = z.object({
	channels: z
		.array(z.enum(['sms', 'email']))
		.min(1, 'Pick at least one channel.')
		.transform((c) => Array.from(new Set(c)))
});

export const POST: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!auth.member.can_send_messages) error(403, 'Forbidden');

	let raw: unknown;
	try {
		raw = await event.request.json();
	} catch {
		return json({ error: 'Invalid request body.' }, { status: 400 });
	}
	const parsed = bodySchema.safeParse(raw);
	if (!parsed.success) {
		const fieldErrors = parsed.error.flatten().fieldErrors;
		return json(
			{
				error: 'Please fix the highlighted fields.',
				field_errors: { channels: fieldErrors.channels?.[0] }
			},
			{ status: 422 }
		);
	}
	const wantsSms = parsed.data.channels.includes('sms');
	const wantsEmail = parsed.data.channels.includes('email');

	const loaded = await loadContext(auth.orgId, event.params.id!);
	if ('errorResponse' in loaded) return loaded.errorResponse;
	const { ctx } = loaded;

	if (ctx.job.status === 'archived') {
		return json(
			{ error: 'This job is closed — an "on my way" message can only be sent for active jobs.' },
			{ status: 422 }
		);
	}
	if (!ctx.settings.job_on_my_way_enabled) {
		return json(
			{ error: '"On my way" messages are turned off in Settings → Automation.' },
			{ status: 422 }
		);
	}

	const eligibility = await Promise.all(
		parsed.data.channels.map((channel) =>
			canContactReceiveCommunication({
				orgId: auth.orgId,
				contactId: ctx.contact.id,
				channel,
				direction: 'outbound',
				category: 'job_on_my_way'
			})
		)
	);
	const blocked = eligibility.find((result) => !result.allowed);
	if (blocked)
		return json(
			{
				error: blocked.reasonMessage ?? 'This communication is blocked.',
				field_errors: { channels: blocked.reasonMessage ?? 'Channel unavailable' }
			},
			{ status: 422 }
		);

	// Re-validate reachability for each requested channel. Surface as a field_error
	// on `channels` so the dialog can map it back to the picker.
	if (wantsSms) {
		if (!ctx.org.twilio_phone_number) {
			return json(
				{
					error: 'Text messaging is not set up for your organization.',
					field_errors: { channels: 'SMS is not configured.' }
				},
				{ status: 422 }
			);
		}
		if (!ctx.contact.phone) {
			return json(
				{
					error: 'This customer has no phone number on file.',
					field_errors: { channels: 'No phone number on file.' }
				},
				{ status: 422 }
			);
		}
	}
	if (wantsEmail && !ctx.contact.email) {
		return json(
			{
				error: 'This customer has no email address on file.',
				field_errors: { channels: 'No email address on file.' }
			},
			{ status: 422 }
		);
	}

	const vars = templateVars(ctx);
	const contactEmail = ctx.contact.email;

	// One transaction: each queue helper inserts a queued message row + its
	// send-request outbox event. The SMS/email workers own actual delivery.
	await db.transaction(async (tx) => {
		if (wantsSms) {
			await queueAutomationSms(tx, {
				orgId: auth.orgId,
				contactId: ctx.contact.id,
				body: interpolate(ctx.settings.job_on_my_way_sms_message, vars),
				source: 'manual.job_on_my_way'
			});
		}
		if (wantsEmail && contactEmail) {
			await queueAutomationEmail(tx, {
				orgId: auth.orgId,
				contactId: ctx.contact.id,
				contactEmail,
				subject: interpolate(ctx.settings.job_on_my_way_email_subject, vars),
				body: interpolate(ctx.settings.job_on_my_way_email_message, vars),
				source: 'manual.job_on_my_way'
			});
		}
	});

	return new Response(null, { status: 204 });
};
