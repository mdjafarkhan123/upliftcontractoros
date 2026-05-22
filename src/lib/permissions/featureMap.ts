import type { FeatureFlagKey } from '$lib/types';

export type FeatureModuleBinding = {
	apiPrefixes: string[];
	navKeys: string[];
	workerEvents?: string[];
};

export const FEATURE_MODULE_MAP: Record<FeatureFlagKey, FeatureModuleBinding> = {
	feature_one_way_sms: {
		apiPrefixes: [],
		navKeys: [],
		workerEvents: []
	},
	feature_two_way_sms: {
		apiPrefixes: [],
		navKeys: [],
		workerEvents: []
	},
	feature_bulk_sms: {
		apiPrefixes: ['/api/conversations/bulk'],
		navKeys: [],
		workerEvents: []
	},
	feature_conversations: {
		apiPrefixes: ['/api/conversations'],
		navKeys: ['inbox'],
		workerEvents: ['message.received', 'message.delivery_failed']
	},
	feature_missed_call_textback: {
		apiPrefixes: [],
		navKeys: [],
		workerEvents: ['call.missed']
	},
	feature_team_management: {
		apiPrefixes: ['/api/team'],
		navKeys: [],
		workerEvents: []
	},
	feature_appointments: {
		apiPrefixes: ['/api/appointments'],
		navKeys: ['appointments'],
		workerEvents: [
			'appointment.created',
			'appointment.booked',
			'appointment.rescheduled',
			'appointment.completed',
			'appointment.cancelled',
			'appointment.no_show'
		]
	},
	feature_media_uploads: {
		apiPrefixes: ['/api/media'],
		navKeys: [],
		workerEvents: []
	},
	feature_automation_engine: {
		apiPrefixes: ['/api/settings/automation'],
		navKeys: [],
		workerEvents: []
	},
	feature_review_funnel: {
		apiPrefixes: ['/api/reputation', '/api/reviews', '/api/review-requests', '/api/private-feedback'],
		navKeys: ['reputation'],
		workerEvents: ['review.received', 'private_feedback.received', 'negative_feedback', 'job.completed']
	},
	feature_appointment_reminders: {
		apiPrefixes: [],
		navKeys: [],
		workerEvents: []
	},
	feature_invoice_reminders: {
		apiPrefixes: [],
		navKeys: [],
		workerEvents: ['invoice.overdue']
	},
	feature_financial_tools: {
		apiPrefixes: ['/api/quotes', '/api/quote-templates', '/api/invoices'],
		navKeys: ['quotes', 'invoices'],
		workerEvents: [
			'quote.sent',
			'quote.viewed',
			'quote.accepted',
			'quote.declined',
			'quote.changes_requested',
			'quote.deposit_paid',
			'invoice.paid'
		]
	},
	feature_stripe_payments: {
		apiPrefixes: [],
		navKeys: [],
		workerEvents: []
	},
	feature_growth_feed: {
		apiPrefixes: ['/api/growth-feed'],
		navKeys: ['growth'],
		workerEvents: []
	},
	feature_advanced_reporting: {
		apiPrefixes: [],
		navKeys: [],
		workerEvents: []
	},
	feature_ai_assistant: {
		apiPrefixes: [],
		navKeys: [],
		workerEvents: []
	},
	feature_custom_branding: {
		apiPrefixes: [],
		navKeys: [],
		workerEvents: []
	},
	feature_api_access: {
		apiPrefixes: [],
		navKeys: [],
		workerEvents: []
	},
	feature_webhooks: {
		apiPrefixes: [],
		navKeys: [],
		workerEvents: []
	},
	feature_client_portal: {
		apiPrefixes: [],
		navKeys: [],
		workerEvents: []
	},
	feature_webchat: {
		apiPrefixes: [],
		navKeys: [],
		workerEvents: []
	},
	feature_online_booking: {
		apiPrefixes: ['/api/booking-links'],
		navKeys: [],
		workerEvents: []
	}
};

export const FEATURE_GATE_BYPASS_PREFIXES: readonly string[] = [
	'/api/admin',
	'/api/webhooks',
	'/api/jafar',
	'/api/webchat',
	'/api/public',
	'/api/session',
	'/api/billing',
	'/api/notifications',
	'/api/dashboard'
];

function prefixMatches(pathname: string, prefix: string): boolean {
	return pathname === prefix || pathname.startsWith(prefix + '/');
}

export function featureForPath(pathname: string): FeatureFlagKey | null {
	for (const prefix of FEATURE_GATE_BYPASS_PREFIXES) {
		if (prefixMatches(pathname, prefix)) return null;
	}
	let matched: { key: FeatureFlagKey; prefix: string } | null = null;
	for (const key of Object.keys(FEATURE_MODULE_MAP) as FeatureFlagKey[]) {
		for (const prefix of FEATURE_MODULE_MAP[key].apiPrefixes) {
			if (prefixMatches(pathname, prefix)) {
				if (!matched || prefix.length > matched.prefix.length) {
					matched = { key, prefix };
				}
			}
		}
	}
	return matched?.key ?? null;
}

export function featureForWorkerEvent(eventType: string): FeatureFlagKey | null {
	for (const key of Object.keys(FEATURE_MODULE_MAP) as FeatureFlagKey[]) {
		if (FEATURE_MODULE_MAP[key].workerEvents?.includes(eventType)) return key;
	}
	return null;
}

export const AUTOMATION_JOB_FEATURE_MAP: Record<string, FeatureFlagKey> = {
	speed_to_lead: 'feature_conversations',
	missed_call_textback: 'feature_missed_call_textback',
	quote_followup: 'feature_financial_tools',
	invoice_reminder: 'feature_invoice_reminders',
	review_request: 'feature_review_funnel',
	appointment_reminder: 'feature_appointment_reminders',
	appointment_reminder_24h: 'feature_appointment_reminders',
	appointment_reminder_1h: 'feature_appointment_reminders',
	appointment_reschedule: 'feature_appointment_reminders'
};

export function featureForAutomationJob(jobName: string): FeatureFlagKey | null {
	return AUTOMATION_JOB_FEATURE_MAP[jobName] ?? null;
}

export function featureForNavKey(navKey: string): FeatureFlagKey | null {
	for (const key of Object.keys(FEATURE_MODULE_MAP) as FeatureFlagKey[]) {
		if (FEATURE_MODULE_MAP[key].navKeys.includes(navKey)) return key;
	}
	return null;
}
