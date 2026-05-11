import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { createServiceClient } from '$lib/server/auth/supabase';
import { db } from '$lib/server/db/client';
import { automationSettings, orgCounters, orgMembers, organizations } from '$lib/server/db/schema';
import { seedPipelineStages } from '$lib/server/db/seed/pipeline_stages';

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
	adminTemporaryPassword: z.string().min(8, 'Temporary password must be at least 8 characters')
});

type CreateOrgInput = z.infer<typeof createOrgSchema>;

const ADMIN_PERMISSIONS = {
	can_view_dashboard: true,
	can_view_revenue: true,
	can_view_pipeline_snapshot: true,
	can_view_all_conversations: true,
	can_view_assigned_conversations: true,
	can_send_messages: true,
	can_delete_conversations: true,
	can_view_all_contacts: true,
	can_create_contacts: true,
	can_edit_contacts: true,
	can_delete_contacts: true,
	can_view_full_pipeline: true,
	can_move_pipeline_stages: true,
	can_create_opportunities: true,
	can_view_assigned_jobs: true,
	can_view_all_quotes: true,
	can_create_quotes: true,
	can_send_quotes: true,
	can_edit_quotes: true,
	can_delete_quotes: true,
	can_view_all_invoices: true,
	can_create_invoices: true,
	can_send_invoices: true,
	can_record_payments: true,
	can_delete_invoices: true,
	can_view_all_appointments: true,
	can_view_assigned_appointments: true,
	can_create_appointments: true,
	can_reschedule_appointments: true,
	can_view_reviews: true,
	can_send_review_requests: true,
	can_view_negative_feedback: true,
	can_view_growth_feed: true,
	can_view_all_files: true,
	can_upload_files: true,
	can_delete_files: true,
	can_view_team_members: true,
	can_create_team_members: true,
	can_edit_team_members: true,
	can_delete_team_members: true
} as const;

const AUTOMATION_DEFAULTS = {
	missed_call_textback_message:
		"Hi! We missed your call. We'll be in touch shortly - or reply here and we'll get back to you right away.",
	quote_followup_message:
		"Hi {contact_name}, just following up on the quote we sent. Any questions? We're happy to help.",
	invoice_reminder_message:
		"Hi {contact_name}, just a reminder that your invoice is due. Please don't hesitate to reach out if you have any questions.",
	review_funnel_message:
		'Hi {contact_name}, thank you for choosing us! How did we do today? Reply with a number from 1-5.',
	appointment_reminder_message:
		'Hi {contact_name}, just a reminder about your appointment tomorrow. Reply STOP to opt out.',
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
				is_setup_complete: false
			});

			await tx.insert(orgCounters).values({
				org_id: orgId,
				next_quote_number: 1,
				next_invoice_number: 1
			});

			await seedPipelineStages(orgId, tx);

			await tx.insert(automationSettings).values({
				org_id: orgId,
				...AUTOMATION_DEFAULTS
			});

			await tx.insert(orgMembers).values({
				org_id: orgId,
				supabase_user_id: authUserId,
				email: input.adminEmail,
				full_name: input.adminFullName,
				role: 'admin',
				is_active: true,
				...ADMIN_PERMISSIONS
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
