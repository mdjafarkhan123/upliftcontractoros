import { json, error } from '@sveltejs/kit';
import { z } from 'zod';
import { and, eq, sql } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { automationSettings } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { validateTemplateVariables } from '$lib/utils/validation/templateVariables';

// NOTE: automation_workflows counter not enforced here.
// Current model is fixed boolean toggles gated by feature_automation_engine.
// Wire assertAndIncrementUsage when user-defined workflows table is introduced.

function assertAdmin(role: string): void {
	if (role !== 'admin') error(403, 'Admin only.');
}

const MSG_MAX = 500;
const DELAY_HOURS_MAX = 720; // 30 days
const DELAY_DAYS_MAX = 90;

const automationPatchSchema = z
	.object({
		updated_at: z.string().min(1),

		missed_call_textback_enabled: z.boolean().optional(),
		missed_call_textback_message: z.string().min(1).max(MSG_MAX).optional(),

		quote_followup_enabled: z.boolean().optional(),
		quote_followup_delay_1_hours: z.number().int().min(0).max(DELAY_HOURS_MAX).optional(),
		quote_followup_delay_2_hours: z.number().int().min(0).max(DELAY_HOURS_MAX).optional(),
		quote_followup_message: z.string().min(1).max(MSG_MAX).optional(),

		invoice_reminder_enabled: z.boolean().optional(),
		invoice_reminder_delay_days: z.number().int().min(0).max(DELAY_DAYS_MAX).optional(),
		invoice_reminder_message: z.string().min(1).max(MSG_MAX).optional(),

		review_funnel_enabled: z.boolean().optional(),
		review_funnel_delay_hours: z.number().int().min(0).max(DELAY_HOURS_MAX).optional(),
		google_review_link: z
			.string()
			.url()
			.regex(/^https:\/\//, 'Must be an https URL.')
			.nullable()
			.optional(),
		review_funnel_message: z.string().min(1).max(MSG_MAX).optional(),
		review_funnel_reminder_enabled: z.boolean().optional(),
		review_funnel_reminder_message: z.string().min(1).max(MSG_MAX).optional(),

		appointment_reminder_enabled: z.boolean().optional(),
		appointment_reminder_hours_before: z.number().int().min(0).max(DELAY_HOURS_MAX).optional(),
		appointment_reminder_message: z.string().min(1).max(MSG_MAX).optional(),
		appointment_reminder_1h_enabled: z.boolean().optional(),
		appointment_reminder_1h_message: z.string().min(1).max(MSG_MAX).optional(),

		appointment_confirmation_enabled: z.boolean().optional(),
		appointment_confirmation_sms_message: z.string().min(1).max(MSG_MAX).optional(),
		appointment_confirmation_email_subject: z.string().min(1).max(200).optional(),
		appointment_confirmation_email_message: z.string().min(1).max(2000).optional(),

		payment_receipt_enabled: z.boolean().optional(),
		payment_receipt_message: z.string().min(1).max(MSG_MAX).optional(),
		payment_receipt_sms_enabled: z.boolean().optional(),
		payment_receipt_sms_message: z.string().min(1).max(MSG_MAX).optional(),

		speed_to_lead_enabled: z.boolean().optional(),
		speed_to_lead_message: z.string().min(1).max(MSG_MAX).optional(),
		speed_to_lead_channel: z.enum(['smart', 'sms', 'email', 'both']).optional(),
		speed_to_lead_email_subject: z.string().min(1).max(200).optional(),
		speed_to_lead_email_message: z.string().min(1).max(2000).optional(),

		auto_create_opp_on_lead: z.boolean().optional()
	})
	.strict();

const TEMPLATE_FIELDS = [
	'missed_call_textback_message',
	'quote_followup_message',
	'invoice_reminder_message',
	'review_funnel_message',
	'review_funnel_reminder_message',
	'appointment_reminder_message',
	'appointment_reminder_1h_message',
	'appointment_confirmation_sms_message',
	'appointment_confirmation_email_subject',
	'appointment_confirmation_email_message',
	'payment_receipt_message',
	'payment_receipt_sms_message',
	'speed_to_lead_message',
	'speed_to_lead_email_subject',
	'speed_to_lead_email_message'
] as const;

const RETURN_COLUMNS = {
	id: automationSettings.id,
	org_id: automationSettings.org_id,
	missed_call_textback_enabled: automationSettings.missed_call_textback_enabled,
	missed_call_textback_message: automationSettings.missed_call_textback_message,
	quote_followup_enabled: automationSettings.quote_followup_enabled,
	quote_followup_delay_1_hours: automationSettings.quote_followup_delay_1_hours,
	quote_followup_delay_2_hours: automationSettings.quote_followup_delay_2_hours,
	quote_followup_message: automationSettings.quote_followup_message,
	invoice_reminder_enabled: automationSettings.invoice_reminder_enabled,
	invoice_reminder_delay_days: automationSettings.invoice_reminder_delay_days,
	invoice_reminder_message: automationSettings.invoice_reminder_message,
	review_funnel_enabled: automationSettings.review_funnel_enabled,
	review_funnel_delay_hours: automationSettings.review_funnel_delay_hours,
	google_review_link: automationSettings.google_review_link,
	review_funnel_message: automationSettings.review_funnel_message,
	review_funnel_reminder_enabled: automationSettings.review_funnel_reminder_enabled,
	review_funnel_reminder_message: automationSettings.review_funnel_reminder_message,
	appointment_reminder_enabled: automationSettings.appointment_reminder_enabled,
	appointment_reminder_hours_before: automationSettings.appointment_reminder_hours_before,
	appointment_reminder_message: automationSettings.appointment_reminder_message,
	appointment_reminder_1h_enabled: automationSettings.appointment_reminder_1h_enabled,
	appointment_reminder_1h_message: automationSettings.appointment_reminder_1h_message,
	appointment_confirmation_enabled: automationSettings.appointment_confirmation_enabled,
	appointment_confirmation_sms_message: automationSettings.appointment_confirmation_sms_message,
	appointment_confirmation_email_subject: automationSettings.appointment_confirmation_email_subject,
	appointment_confirmation_email_message: automationSettings.appointment_confirmation_email_message,
	payment_receipt_enabled: automationSettings.payment_receipt_enabled,
	payment_receipt_message: automationSettings.payment_receipt_message,
	payment_receipt_sms_enabled: automationSettings.payment_receipt_sms_enabled,
	payment_receipt_sms_message: automationSettings.payment_receipt_sms_message,
	speed_to_lead_enabled: automationSettings.speed_to_lead_enabled,
	speed_to_lead_message: automationSettings.speed_to_lead_message,
	speed_to_lead_channel: automationSettings.speed_to_lead_channel,
	speed_to_lead_email_subject: automationSettings.speed_to_lead_email_subject,
	speed_to_lead_email_message: automationSettings.speed_to_lead_email_message,
	auto_create_opp_on_lead: automationSettings.auto_create_opp_on_lead,
	// Cast to text so the canonical PostgreSQL microsecond precision survives
	// the round-trip — JS Date truncates to milliseconds and breaks the
	// optimistic-concurrency equality check.
	updated_at: sql<string>`${automationSettings.updated_at}::text`.as('updated_at')
};

export const GET: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	assertAdmin(auth.member.role);

	const [row] = await db
		.select(RETURN_COLUMNS)
		.from(automationSettings)
		.where(eq(automationSettings.org_id, auth.orgId))
		.limit(1);

	if (!row) error(404, 'Automation settings not found.');

	return json({ data: row });
};

export const PATCH: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	assertAdmin(auth.member.role);

	let body: unknown;
	try {
		body = await event.request.json();
	} catch {
		return json({ error: 'Invalid JSON.' }, { status: 400 });
	}

	const parsed = automationPatchSchema.safeParse(body);
	if (!parsed.success) {
		const field_errors: Record<string, string> = {};
		for (const issue of parsed.error.issues) {
			const key = issue.path[0]?.toString();
			if (key) field_errors[key] = issue.message;
		}
		return json({ error: 'Unknown or invalid fields.', field_errors }, { status: 400 });
	}

	const input = parsed.data;
	const previousUpdatedAt = input.updated_at;
	if (Number.isNaN(new Date(previousUpdatedAt).getTime())) {
		return json({ error: 'Invalid updated_at value.' }, { status: 400 });
	}

	const field_errors: Record<string, string> = {};
	for (const f of TEMPLATE_FIELDS) {
		const v = (input as Record<string, unknown>)[f];
		if (typeof v === 'string') {
			const r = validateTemplateVariables(v);
			if (!r.ok) {
				field_errors[f] = `Unknown variable(s): ${r.unknown.map((u) => `{${u}}`).join(', ')}.`;
			}
		}
	}
	if (
		typeof input.review_funnel_message === 'string' &&
		!input.review_funnel_message.includes('{review_link}')
	) {
		field_errors.review_funnel_message =
			'Must include {review_link} — the public review link is the primary CTA.';
	}
	if (
		typeof input.review_funnel_reminder_message === 'string' &&
		!input.review_funnel_reminder_message.includes('{review_link}')
	) {
		field_errors.review_funnel_reminder_message =
			'Must include {review_link} — the public review link is the primary CTA.';
	}
	if (Object.keys(field_errors).length > 0) {
		return json({ error: 'Validation failed.', field_errors }, { status: 400 });
	}

	// Build update set (everything except updated_at concurrency token).
	const updates: Record<string, unknown> = {};
	for (const [k, v] of Object.entries(input)) {
		if (k === 'updated_at') continue;
		if (v !== undefined) updates[k] = v;
	}

	if (Object.keys(updates).length === 0) {
		return json({ error: 'No editable fields provided.' }, { status: 400 });
	}

	const now = new Date();
	updates.updated_at = now;

	const [updated] = await db
		.update(automationSettings)
		.set(updates)
		.where(
			and(
				eq(automationSettings.org_id, auth.orgId),
				sql`${automationSettings.updated_at}::text = ${previousUpdatedAt}`
			)
		)
		.returning(RETURN_COLUMNS);

	if (!updated) {
		// Either row missing or stale updated_at — return current row.
		const [current] = await db
			.select(RETURN_COLUMNS)
			.from(automationSettings)
			.where(eq(automationSettings.org_id, auth.orgId))
			.limit(1);

		console.log(
			JSON.stringify({
				level: 'warn',
				event: 'settings.automation.concurrency_conflict',
				org_id: auth.orgId,
				member_id: auth.member.id,
				incoming_updated_at: previousUpdatedAt,
				current_updated_at: current?.updated_at ?? null,
				equal: current?.updated_at === previousUpdatedAt
			})
		);

		if (!current) return json({ error: 'Automation settings not found.' }, { status: 404 });

		return json({ error: 'Settings changed elsewhere.', data: current }, { status: 409 });
	}

	console.log(
		JSON.stringify({
			level: 'info',
			event: 'settings.automation.updated',
			request_id: crypto.randomUUID(),
			org_id: auth.orgId,
			member_id: auth.member.id,
			route: 'PATCH /api/settings/automation',
			changed_fields: Object.keys(updates).filter((k) => k !== 'updated_at')
		})
	);

	return json({ data: updated });
};
