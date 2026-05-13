import type { FeatureFlagKey } from '$lib/types';

export type FeatureFlagDef = {
	key: FeatureFlagKey;
	label: string;
	description: string;
	requires?: 'stripe' | 'twilio';
};

export type FeatureFlagGroup = {
	id: string;
	title: string;
	description: string;
	flags: FeatureFlagDef[];
};

export const FEATURE_FLAG_GROUPS: FeatureFlagGroup[] = [
	{
		id: 'workspace',
		title: 'Workspace',
		description: 'Core CRM modules every tenant uses.',
		flags: [
			{
				key: 'feature_team_management',
				label: 'Team management',
				description: 'Invite, edit, and deactivate org members.'
			},
			{
				key: 'feature_appointments',
				label: 'Appointments',
				description: 'Calendar and scheduling for jobs and consults.'
			},
			{
				key: 'feature_media_uploads',
				label: 'Media uploads',
				description: 'Photo and document uploads on jobs and contacts.'
			}
		]
	},
	{
		id: 'messaging',
		title: 'Messaging',
		description: 'Inbound and outbound SMS surfaces.',
		flags: [
			{
				key: 'feature_one_way_sms',
				label: 'One-way SMS',
				description: 'Outbound transactional SMS (quotes, invoices).',
				requires: 'twilio'
			},
			{
				key: 'feature_two_way_sms',
				label: 'Two-way SMS',
				description: 'Conversational inbound + outbound replies.',
				requires: 'twilio'
			},
			{
				key: 'feature_bulk_sms',
				label: 'Bulk SMS',
				description: 'Broadcast campaigns to contact segments.',
				requires: 'twilio'
			},
			{
				key: 'feature_conversations',
				label: 'Conversations inbox',
				description: 'Unified inbox UI for SMS threads.'
			},
			{
				key: 'feature_missed_call_textback',
				label: 'Missed call textback',
				description: 'Auto-reply when a tenant misses an inbound call.',
				requires: 'twilio'
			}
		]
	},
	{
		id: 'automation',
		title: 'Automation',
		description: 'Background workflows and reminders.',
		flags: [
			{
				key: 'feature_automation_engine',
				label: 'Automation engine',
				description: 'BullMQ-driven multi-step automations.'
			},
			{
				key: 'feature_review_funnel',
				label: 'Review funnel',
				description: 'NPS-style follow-up and review routing.',
				requires: 'twilio'
			},
			{
				key: 'feature_appointment_reminders',
				label: 'Appointment reminders',
				description: 'Pre-appointment SMS reminders.',
				requires: 'twilio'
			},
			{
				key: 'feature_invoice_reminders',
				label: 'Invoice reminders',
				description: 'Past-due nudges for outstanding invoices.',
				requires: 'twilio'
			}
		]
	},
	{
		id: 'financial',
		title: 'Financial',
		description: 'Money flows: quoting, invoicing, payment collection.',
		flags: [
			{
				key: 'feature_financial_tools',
				label: 'Quotes & invoices',
				description: 'Quote and invoice creation, sending, recording payments.'
			},
			{
				key: 'feature_stripe_payments',
				label: 'Stripe payments',
				description: 'Card collection on invoices and the client portal.',
				requires: 'stripe'
			},
			{
				key: 'feature_client_portal',
				label: 'Client portal',
				description: 'Public links so customers can view quotes/invoices.'
			}
		]
	},
	{
		id: 'ai',
		title: 'AI',
		description: 'AI-assisted features.',
		flags: [
			{
				key: 'feature_ai_assistant',
				label: 'AI assistant',
				description: 'Drafting, summarization, and inbox assist.'
			}
		]
	},
	{
		id: 'reporting',
		title: 'Reporting',
		description: 'Insight surfaces and growth feed.',
		flags: [
			{
				key: 'feature_growth_feed',
				label: 'Growth feed',
				description: 'Activity stream of wins, losses, and milestones.'
			},
			{
				key: 'feature_advanced_reporting',
				label: 'Advanced reporting',
				description: 'Pipeline analytics, cohort, and revenue dashboards.'
			}
		]
	},
	{
		id: 'integrations',
		title: 'Integrations & API',
		description: 'Outbound integration surfaces.',
		flags: [
			{
				key: 'feature_custom_branding',
				label: 'Custom branding',
				description: 'Logo, primary color, and branded send domains.'
			},
			{
				key: 'feature_api_access',
				label: 'API access',
				description: 'Public REST API and personal access tokens.'
			},
			{
				key: 'feature_webhooks',
				label: 'Webhooks',
				description: 'Outbound webhook subscriptions for org events.'
			}
		]
	}
];

export type LimitDef = {
	key: keyof import('$lib/types').OrgLimits;
	label: string;
	description: string;
	unit: string;
	zeroMeans: 'disabled' | 'unlimited';
};

export const LIMIT_DEFS: LimitDef[] = [
	{
		key: 'max_team_members',
		label: 'Team member seats',
		description: 'Maximum active org members.',
		unit: 'seats',
		zeroMeans: 'unlimited'
	},
	{
		key: 'max_monthly_sms',
		label: 'Monthly SMS',
		description: 'Outbound SMS sends per calendar month.',
		unit: 'msgs / mo',
		zeroMeans: 'unlimited'
	},
	{
		key: 'max_bulk_sms_per_day',
		label: 'Bulk SMS per day',
		description: 'Cap on broadcast SMS sends per day.',
		unit: 'msgs / day',
		zeroMeans: 'disabled'
	},
	{
		key: 'max_ai_requests_per_month',
		label: 'AI requests per month',
		description: 'Cap on AI assistant invocations per month.',
		unit: 'req / mo',
		zeroMeans: 'disabled'
	},
	{
		key: 'max_storage_gb',
		label: 'Storage cap',
		description: 'Total media + document storage.',
		unit: 'GB',
		zeroMeans: 'unlimited'
	},
	{
		key: 'max_automation_workflows',
		label: 'Automation workflows',
		description: 'Maximum concurrent automation workflows.',
		unit: 'workflows',
		zeroMeans: 'disabled'
	}
];
