import { z } from 'zod';
import type { FeatureFlags, OrgLimits } from '$lib/types';

export const PLAN_NAMES = ['starter', 'growth', 'elite'] as const;
export type PlanName = (typeof PLAN_NAMES)[number];

export const featureFlagsSchema = z.object({
	feature_one_way_sms: z.boolean(),
	feature_two_way_sms: z.boolean(),
	feature_bulk_sms: z.boolean(),
	feature_conversations: z.boolean(),
	feature_missed_call_textback: z.boolean(),
	feature_team_management: z.boolean(),
	feature_appointments: z.boolean(),
	feature_online_booking: z.boolean(),
	feature_media_uploads: z.boolean(),
	feature_automation_engine: z.boolean(),
	feature_review_funnel: z.boolean(),
	feature_appointment_reminders: z.boolean(),
	feature_invoice_reminders: z.boolean(),
	feature_financial_tools: z.boolean(),
	feature_stripe_payments: z.boolean(),
	feature_growth_feed: z.boolean(),
	feature_advanced_reporting: z.boolean(),
	feature_ai_assistant: z.boolean(),
	feature_custom_branding: z.boolean(),
	feature_api_access: z.boolean(),
	feature_webhooks: z.boolean(),
	feature_client_portal: z.boolean(),
	feature_webchat: z.boolean()
}) satisfies z.ZodType<FeatureFlags>;

const limit = z.number().int().min(0).max(1_000_000);

export const limitsSchema = z.object({
	max_team_members: limit,
	max_monthly_sms: limit,
	max_bulk_sms_per_day: limit,
	max_ai_requests_per_month: limit,
	max_storage_gb: limit,
	max_automation_workflows: limit
}) satisfies z.ZodType<OrgLimits>;

export const planNameSchema = z.enum(PLAN_NAMES);

export type PlanTemplate = {
	plan: PlanName;
	label: string;
	tagline: string;
	flags: FeatureFlags;
	limits: OrgLimits;
};

const STARTER: PlanTemplate = {
	plan: 'starter',
	label: 'Starter',
	tagline: 'Solo operator. Lead capture + basic CRM.',
	flags: {
		feature_one_way_sms: true,
		feature_two_way_sms: false,
		feature_bulk_sms: false,
		feature_conversations: true,
		feature_missed_call_textback: false,
		feature_team_management: true,
		feature_appointments: true,
		feature_online_booking: false,
		feature_media_uploads: true,
		feature_automation_engine: false,
		feature_review_funnel: false,
		feature_appointment_reminders: false,
		feature_invoice_reminders: false,
		feature_financial_tools: true,
		feature_stripe_payments: false,
		feature_growth_feed: false,
		feature_advanced_reporting: false,
		feature_ai_assistant: false,
		feature_custom_branding: false,
		feature_api_access: false,
		feature_webhooks: false,
		feature_client_portal: false,
		feature_webchat: false
	},
	limits: {
		max_team_members: 3,
		max_monthly_sms: 500,
		max_bulk_sms_per_day: 0,
		max_ai_requests_per_month: 0,
		max_storage_gb: 5,
		max_automation_workflows: 0
	}
};

const GROWTH: PlanTemplate = {
	plan: 'growth',
	label: 'Growth',
	tagline: 'Small crew. Two-way SMS, automations, Stripe.',
	flags: {
		feature_one_way_sms: true,
		feature_two_way_sms: true,
		feature_bulk_sms: true,
		feature_conversations: true,
		feature_missed_call_textback: true,
		feature_team_management: true,
		feature_appointments: true,
		feature_online_booking: false,
		feature_media_uploads: true,
		feature_automation_engine: true,
		feature_review_funnel: true,
		feature_appointment_reminders: true,
		feature_invoice_reminders: true,
		feature_financial_tools: true,
		feature_stripe_payments: true,
		feature_growth_feed: true,
		feature_advanced_reporting: false,
		feature_ai_assistant: false,
		feature_custom_branding: false,
		feature_api_access: false,
		feature_webhooks: false,
		feature_client_portal: true,
		feature_webchat: false
	},
	limits: {
		max_team_members: 10,
		max_monthly_sms: 5_000,
		max_bulk_sms_per_day: 500,
		max_ai_requests_per_month: 0,
		max_storage_gb: 50,
		max_automation_workflows: 10
	}
};

const ELITE: PlanTemplate = {
	plan: 'elite',
	label: 'Elite',
	tagline: 'Multi-crew. AI, reporting, API, custom branding.',
	flags: {
		feature_one_way_sms: true,
		feature_two_way_sms: true,
		feature_bulk_sms: true,
		feature_conversations: true,
		feature_missed_call_textback: true,
		feature_team_management: true,
		feature_appointments: true,
		feature_online_booking: false,
		feature_media_uploads: true,
		feature_automation_engine: true,
		feature_review_funnel: true,
		feature_appointment_reminders: true,
		feature_invoice_reminders: true,
		feature_financial_tools: true,
		feature_stripe_payments: true,
		feature_growth_feed: true,
		feature_advanced_reporting: true,
		feature_ai_assistant: true,
		feature_custom_branding: true,
		feature_api_access: true,
		feature_webhooks: true,
		feature_client_portal: true,
		feature_webchat: true
	},
	limits: {
		max_team_members: 50,
		max_monthly_sms: 25_000,
		max_bulk_sms_per_day: 2_500,
		max_ai_requests_per_month: 5_000,
		max_storage_gb: 250,
		max_automation_workflows: 50
	}
};

export const PLAN_TEMPLATES: Record<PlanName, PlanTemplate> = {
	starter: STARTER,
	growth: GROWTH,
	elite: ELITE
};

export const PLAN_TEMPLATE_LIST: PlanTemplate[] = [STARTER, GROWTH, ELITE];

export function getPlanTemplate(plan: PlanName): PlanTemplate {
	return PLAN_TEMPLATES[plan];
}
