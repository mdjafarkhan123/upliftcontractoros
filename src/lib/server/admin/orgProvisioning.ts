import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { createServiceClient } from '$lib/server/auth/supabase';
import { db } from '$lib/server/db/client';
import {
	automationSettings,
	orgCounters,
	orgMembers,
	orgSmsCredit,
	organizations
} from '$lib/server/db/schema';
import { seedPipelineStages } from '$lib/server/db/seed/pipeline_stages';
import {
	featureFlagsSchema,
	limitsSchema,
	planNameSchema,
	PLAN_TEMPLATES
} from '$lib/admin/planTemplates';
import { adminPermissionsSchema, fullAdminPermissions } from '$lib/permissions/permissions-matrix';

export const createOrgSchema = z.object({
	businessName: z.string().trim().min(1, 'Business name is required'),
	slug: z
		.string()
		.trim()
		.min(1, 'Slug is required')
		.regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers, and hyphens only'),
	tradeType: z.string().trim().min(1, 'Trade type is required'),
	city: z.string().trim().min(1, 'City is required'),
	state: z.string().trim().min(1, 'State is required'),
	timezone: z.string().trim().min(1, 'Timezone is required'),
	twilioPhoneNumber: z
		.string()
		.trim()
		.regex(/^\+[1-9]\d{1,14}$/, 'Twilio phone number must be E.164, e.g. +15551234567'),
	adminFullName: z.string().trim().min(1, 'Admin full name is required'),
	adminEmail: z.string().trim().email('Admin email must be valid'),
	adminTemporaryPassword: z.string().min(8, 'Temporary password must be at least 8 characters'),
	plan: planNameSchema.optional(),
	featureFlags: featureFlagsSchema.optional(),
	limits: limitsSchema.optional(),
	adminPermissions: adminPermissionsSchema.optional()
});

type CreateOrgInput = z.infer<typeof createOrgSchema>;

const AUTOMATION_DEFAULTS = {
	missed_call_textback_message:
		"Hi! We missed your call. We'll be in touch shortly - or reply here and we'll get back to you right away.",
	quote_followup_message:
		"Hi {contact_name}, just following up on the quote we sent. Any questions? We're happy to help.",
	invoice_reminder_message:
		"Hi {contact_name}, just a reminder that your invoice is due. Please don't hesitate to reach out if you have any questions.",
	review_funnel_message:
		'Hi {contact_name}, it was a pleasure working with you. A quick review from you means the world to a small team like ours at {org_name} — and helps neighbors find us too. Takes 20 seconds: {review_link}',
	review_funnel_reminder_message:
		"Hi {contact_name}, quick nudge from {org_name} — we'd love your rating: {review_link}",
	review_funnel_nudge_1_message:
		'Hi {contact_name}, thanks again for the rating! When you have a sec, would you mind leaving a quick public review? It helps a lot: {review_link}',
	review_funnel_nudge_2_message:
		'Hi {contact_name}, last nudge from {org_name} — a public review really helps neighbors find us: {review_link}',
	appointment_reminder_message:
		'Hi {contact_name}, just a reminder about your appointment tomorrow. Reply STOP to opt out.',
	appointment_reminder_1h_message:
		'Hi {contact_name}, just a reminder — your appointment is in about 1 hour. See you soon!',
	appointment_confirmation_sms_message:
		"Hi {contact_name}, your {appointment_type} with {org_name} is confirmed for {appointment_datetime}. We'll text a reminder before. Need to change it? {manage_link}",
	appointment_confirmation_email_subject: 'Your appointment with {org_name} is confirmed',
	appointment_confirmation_email_message:
		"Hi {contact_name},\n\nYour {appointment_type} with {org_name} is confirmed for {appointment_datetime}.\n\n{location_block}We've attached a calendar invite so you can add it to Google, Outlook, or Apple Calendar in one tap.\n\nNeed to reschedule or cancel? {manage_link}\n\nIf anything else comes up, just reply to this email and we'll sort it out.\n\nThanks,\n{org_name}",
	payment_receipt_message:
		'Hi {contact_name}, we received your payment of {amount}. Thank you — we appreciate your business!',
	payment_receipt_sms_message:
		'Hi {contact_name}, thanks for your payment of {amount} to {org_name}. Reply STOP to opt out.',
	speed_to_lead_message:
		"Hi {contact_name}, thanks for reaching out! We'll get back to you shortly."
} as const;

async function deleteAuthUser(userId: string): Promise<string | null> {
	const supabase = createServiceClient();
	const { error } = await supabase.auth.admin.deleteUser(userId);
	return error?.message ?? null;
}

export async function createOrganizationWithAdmin(
	input: CreateOrgInput
): Promise<{ orgId: string }> {
	const supabase = createServiceClient();
	const orgId = randomUUID();
	let authUserId: string | null = null;

	const plan = input.plan ?? 'starter';
	const template = PLAN_TEMPLATES[plan];
	const flags = input.featureFlags ?? template.flags;
	const limits = input.limits ?? template.limits;
	const adminPermissions = input.adminPermissions ?? fullAdminPermissions();

	const { data: createdUser, error: createUserError } = await supabase.auth.admin.createUser({
		email: input.adminEmail,
		password: input.adminTemporaryPassword,
		email_confirm: true,
		user_metadata: { full_name: input.adminFullName }
	});

	if (createUserError || !createdUser.user) {
		throw new Error(createUserError?.message ?? 'Supabase Auth user creation failed.');
	}

	authUserId = createdUser.user.id;

	const { error: metadataError } = await supabase.auth.admin.updateUserById(authUserId, {
		app_metadata: {
			org_id: orgId,
			role: 'admin',
			password_changed: false
		}
	});

	if (metadataError) {
		const cleanupError = await deleteAuthUser(authUserId);
		throw new Error(
			`Supabase Auth metadata update failed: ${metadataError.message}${
				cleanupError ? ` Cleanup failed: ${cleanupError}` : ''
			}`
		);
	}

	try {
		await db.transaction(async (tx) => {
			await tx.insert(organizations).values({
				id: orgId,
				name: input.businessName,
				slug: input.slug,
				trade_type: input.tradeType,
				city: input.city,
				state: input.state,
				timezone: input.timezone,
				twilio_phone_number: input.twilioPhoneNumber,
				is_setup_complete: false,
				plan,
				...flags,
				...limits,
				feature_overrides_updated_at: new Date()
			});

			await tx.insert(orgCounters).values({
				org_id: orgId,
				next_quote_number: 1,
				next_invoice_number: 1
			});

			// Seed the SMS credit account with one month's included allowance.
			// monthly_included_credit and per_sms_cost use their column defaults;
			// last_monthly_grant_at = now so the monthly cron won't double-grant.
			await tx.insert(orgSmsCredit).values({
				org_id: orgId,
				balance: '5.0000',
				last_monthly_grant_at: new Date()
			});

			await seedPipelineStages(orgId, tx);

			await tx.insert(automationSettings).values({
				org_id: orgId,
				...AUTOMATION_DEFAULTS
			});

			// role is display metadata; the permission booleans are the authority.
			await tx.insert(orgMembers).values({
				org_id: orgId,
				supabase_user_id: authUserId,
				email: input.adminEmail,
				full_name: input.adminFullName,
				role: 'admin',
				is_active: true,
				...adminPermissions
			});
		});
	} catch (error) {
		const cleanupError = authUserId ? await deleteAuthUser(authUserId) : null;
		const message = error instanceof Error ? error.message : 'Database provisioning failed.';
		throw new Error(`${message}${cleanupError ? ` Cleanup failed: ${cleanupError}` : ''}`, {
			cause: error
		});
	}

	return { orgId };
}

export async function completeOrgSetup(orgId: string): Promise<void> {
	await db
		.update(organizations)
		.set({ is_setup_complete: true, updated_at: new Date() })
		.where(eq(organizations.id, orgId));
}
