export const NOTIFICATION_TYPES = [
	// Sales
	'new_lead',
	'quote_viewed',
	'quote_accepted',
	'quote_deposit_paid',
	'quote_declined',
	'quote_changes_requested',
	'quote_expired',
	// Money
	'payment_received',
	'invoice_viewed',
	'job_invoice_reminder',
	// Operations
	'new_request',
	'message_received',
	'appointment_booked',
	'appointment_rescheduled',
	'appointment_cancelled',
	'appointment_no_show',
	'appointment_quote_nudge',
	'missed_call_handled',
	'contact_follow_up_due',
	'opportunity_follow_up_due',
	'opportunity_stale_digest',
	// Reputation
	'new_review',
	'negative_feedback',
	// Growth
	'growth_feed_update',
	// Data
	'contact_import_completed',
	// Infrastructure
	'sms_credit_low'
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];
export type NotificationPriority = 'critical' | 'high' | 'normal' | 'silent';

export type PushPayload = {
	v: 1;
	notification_id: string;
	type: NotificationType | string;
	priority: NotificationPriority;
	route: string;
	resource_id: string;
	title: string;
	body: string;
	require_interaction: boolean;
	metadata: Record<string, unknown>;
};
