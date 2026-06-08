import type { FeatureFlagKey, OrgLimits } from '$lib/types';

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
				key: 'feature_online_booking',
				label: 'Online Booking',
				description: 'Public booking links so customers can self-schedule appointments.'
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
				description:
					'Outbound-only transactional SMS sends (quote/invoice links, ad-hoc messages). No inbound delivery.',
				requires: 'twilio'
			},
			{
				key: 'feature_two_way_sms',
				label: 'Two-way SMS',
				description:
					'Full conversational SMS — inbound replies land in the inbox and can be responded to.',
				requires: 'twilio'
			},
			{
				key: 'feature_bulk_sms',
				label: 'Bulk SMS',
				description:
					'Broadcast SMS campaigns to contact segments. Rate-limited by the bulk-per-day cap.',
				requires: 'twilio'
			},
			{
				key: 'feature_conversations',
				label: 'Conversations inbox',
				description: 'Unified inbox UI for SMS, email, and webchat threads.'
			},
			{
				key: 'feature_missed_call_textback',
				label: 'Missed call textback',
				description:
					'Auto-replies an SMS the moment the org misses an inbound call. SMS-only — this gate is also the SMS allowance.',
				requires: 'twilio'
			},
			{
				key: 'feature_webchat',
				label: 'Web chat widget',
				description:
					'Embeddable website chat widget that drops conversations into the inbox asynchronously.'
			},
			{
				key: 'feature_messenger',
				label: 'Facebook Messenger',
				description:
					'Facebook Page DMs land in the inbox as a unified channel. After enabling, the contractor connects their Page in Settings → Integrations.'
			}
		]
	},
	{
		id: 'automation',
		title: 'Automation',
		description:
			'Background workflows, reminders, and receipts. Capability gates — flip off to disable the entire automation for the org, regardless of contractor toggles.',
		flags: [
			{
				key: 'feature_automation_engine',
				label: 'Automation engine',
				description:
					'Master switch for the BullMQ automation runtime. Required by every automation below.'
			},
			{
				key: 'feature_review_funnel',
				label: 'Review funnel',
				description: 'Post-job NPS-style follow-up that routes happy customers to Google reviews.',
				requires: 'twilio'
			},
			{
				key: 'feature_appointment_reminders',
				label: 'Appointment reminders',
				description: 'Pre-appointment reminders sent ~24h and 1h before the slot.',
				requires: 'twilio'
			},
			{
				key: 'feature_invoice_reminders',
				label: 'Invoice reminders',
				description: 'Past-due nudges for outstanding invoices.',
				requires: 'twilio'
			},
			{
				key: 'feature_payment_receipt',
				label: 'Payment receipts',
				description:
					'Send a receipt to the customer after each recorded payment. Capability covers both email and SMS channels.'
			},
			{
				key: 'feature_quote_followup',
				label: 'Quote follow-up',
				description: 'Two-stage nudge to customers who received a quote but haven’t responded.',
				requires: 'twilio'
			},
			{
				key: 'feature_speed_to_lead',
				label: 'Speed to lead',
				description: 'Auto-reply within seconds of a new inbound lead to maximize contact rate.',
				requires: 'twilio'
			}
		]
	},
	{
		id: 'sms-allowances',
		title: 'SMS Channel Allowances',
		description:
			'Per-automation SMS channel gates. SMS-only automations (missed call textback, speed to lead) use their capability flag above as the SMS gate. These flags only affect the SMS variant — email always sends when the capability is on.',
		flags: [
			{
				key: 'payment_receipt_sms_allowed',
				label: 'Payment receipt — SMS',
				description:
					'Allow sending payment receipts as SMS in addition to email. Disable to keep receipts email-only and cap Twilio cost.',
				requires: 'twilio'
			},
			{
				key: 'quote_followup_sms_allowed',
				label: 'Quote follow-up — SMS',
				description:
					'Allow quote follow-up nudges via SMS. Requires the Quote follow-up capability.',
				requires: 'twilio'
			},
			{
				key: 'appointment_reminder_sms_allowed',
				label: 'Appointment reminders — SMS',
				description:
					'Allow appointment reminders via SMS. Requires the Appointment reminders capability.',
				requires: 'twilio'
			},
			{
				key: 'invoice_reminder_sms_allowed',
				label: 'Invoice reminders — SMS',
				description:
					'Allow past-due invoice nudges via SMS. Requires the Invoice reminders capability.',
				requires: 'twilio'
			},
			{
				key: 'review_funnel_sms_allowed',
				label: 'Review funnel — SMS',
				description:
					'Allow review-funnel follow-ups via SMS. Requires the Review funnel capability.',
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

// Precomputed key arrays — used by hot paths (dirty tracking, seeding) so
// they live at module scope and never reallocate per component instance.
export const FEATURE_FLAG_KEYS: readonly FeatureFlagKey[] = FEATURE_FLAG_GROUPS.flatMap((g) =>
	g.flags.map((f) => f.key)
);

// Feature flags governed by the PO master SMS switch (organizations.sms_enabled).
// When the master switch is OFF these are disabled/greyed in the editor and their
// SMS effect is blocked at runtime in smsWorker — but their STORED values are never
// wiped, so flipping the master back on restores the org's prior config.
// Excludes feature_conversations (multi-channel inbox) and the dual-channel
// capability flags (review_funnel, appointment_reminders, invoice_reminders,
// quote_followup, payment_receipt) whose email side still sends when SMS is off.
export const SMS_MASTER_GATED_FLAGS: ReadonlySet<FeatureFlagKey> = new Set<FeatureFlagKey>([
	'feature_one_way_sms',
	'feature_two_way_sms',
	'feature_bulk_sms',
	'feature_missed_call_textback',
	'feature_speed_to_lead',
	'payment_receipt_sms_allowed',
	'quote_followup_sms_allowed',
	'appointment_reminder_sms_allowed',
	'invoice_reminder_sms_allowed',
	'review_funnel_sms_allowed'
]);

export const LIMIT_KEYS: readonly (keyof OrgLimits)[] = [
	'max_team_members',
	'max_monthly_sms',
	'max_bulk_sms_per_day',
	'max_sms_per_minute',
	'max_sms_per_day',
	'max_ai_requests_per_month',
	'max_storage_gb',
	'max_automation_workflows'
];

export type LimitDef = {
	key: keyof OrgLimits;
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
		key: 'max_sms_per_minute',
		label: 'SMS per minute',
		description: 'Outbound send-rate throttle. Over-cap sends are deferred, not dropped.',
		unit: 'msgs / min',
		zeroMeans: 'unlimited'
	},
	{
		key: 'max_sms_per_day',
		label: 'SMS per day (rate)',
		description: 'Daily outbound send-rate throttle. Over-cap sends defer to the next day.',
		unit: 'msgs / day',
		zeroMeans: 'unlimited'
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
