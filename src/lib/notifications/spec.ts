import type { NotificationType, NotificationPriority } from './types';

export type NotificationSpec = {
	priority: NotificationPriority;
	defaultVisible: boolean;
	batchable: boolean;
	throttleMinutes?: number;
	requireInteraction: boolean;
	// When true, an unread in-app notification of this type triggers a delayed
	// escalation check (Stage 1.d): if still unread after the recipient's
	// escalation_minutes, it is re-delivered on the louder email/SMS channels.
	// Reserved for the few "ignoring this costs money/a customer" types.
	escalate?: boolean;
	route: (resourceId: string) => string;
	label: string;
	description: string;
};

export const NOTIFICATION_SPEC: Record<NotificationType, NotificationSpec> = {
	new_lead: {
		priority: 'critical',
		defaultVisible: true,
		batchable: false,
		requireInteraction: true,
		// The canonical speed-to-lead case: an unopened lead escalates to email/SMS.
		escalate: true,
		route: (id) => `/contacts/${id}`,
		label: 'New lead arrived',
		description: 'Someone wants to hire you'
	},
	message_received: {
		priority: 'critical',
		defaultVisible: true,
		batchable: true,
		// Throttle per conversation — different conversations always push immediately
		throttleMinutes: 5,
		requireInteraction: false,
		route: (id) => `/inbox/${id}`,
		label: 'New message',
		description: 'A customer messaged you'
	},
	missed_call_handled: {
		priority: 'critical',
		defaultVisible: true,
		batchable: false,
		requireInteraction: false,
		route: (id) => `/contacts/${id}`,
		label: 'Missed call followed up',
		description: 'We texted them back for you'
	},
	appointment_no_show: {
		priority: 'critical',
		defaultVisible: true,
		batchable: false,
		requireInteraction: true,
		route: (id) => `/appointments/${id}`,
		label: "Customer didn't show up",
		description: 'A booked appointment was a no-show'
	},
	appointment_quote_nudge: {
		priority: 'high',
		defaultVisible: true,
		batchable: false,
		requireInteraction: false,
		route: (id) => `/appointments/${id}`,
		label: 'Quote not sent yet',
		description: "You visited a customer but haven't sent a quote"
	},
	appointment_cancelled: {
		priority: 'critical',
		defaultVisible: true,
		batchable: false,
		requireInteraction: false,
		route: (id) => `/appointments/${id}`,
		label: 'Appointment cancelled',
		description: 'A customer cancelled their appointment'
	},
	appointment_rescheduled: {
		priority: 'critical',
		defaultVisible: true,
		batchable: false,
		requireInteraction: false,
		route: (id) => `/appointments/${id}`,
		label: 'Appointment rescheduled',
		description: 'A customer changed their appointment time'
	},
	quote_viewed: {
		priority: 'high',
		defaultVisible: true,
		batchable: true,
		throttleMinutes: 30,
		requireInteraction: false,
		route: (id) => `/quotes/${id}`,
		label: 'Quote opened',
		description: 'A customer just looked at your quote'
	},
	quote_accepted: {
		priority: 'high',
		defaultVisible: true,
		batchable: false,
		requireInteraction: false,
		route: (id) => `/quotes/${id}`,
		label: 'Quote accepted',
		description: 'They said yes'
	},
	payment_received: {
		priority: 'high',
		defaultVisible: true,
		batchable: false,
		requireInteraction: false,
		route: (id) => `/invoices/${id}`,
		label: 'Payment in',
		description: 'Money landed in your account'
	},
	quote_deposit_paid: {
		priority: 'high',
		defaultVisible: false,
		batchable: false,
		requireInteraction: false,
		route: (id) => `/quotes/${id}`,
		label: 'Deposit received',
		description: 'A customer paid their quote deposit'
	},
	invoice_viewed: {
		priority: 'high',
		defaultVisible: false,
		batchable: true,
		throttleMinutes: 30,
		requireInteraction: false,
		route: (id) => `/invoices/${id}`,
		label: 'Invoice opened',
		description: 'A customer just looked at your invoice'
	},
	job_invoice_reminder: {
		priority: 'high',
		defaultVisible: true,
		batchable: false,
		requireInteraction: false,
		route: (id) => `/jobs/${id}`,
		label: 'Time to invoice',
		description: "A job you finished is ready to bill — don't leave money on the table"
	},
	appointment_booked: {
		priority: 'high',
		defaultVisible: false,
		batchable: false,
		requireInteraction: false,
		route: (id) => `/appointments/${id}`,
		label: 'Appointment booked',
		description: 'A new appointment was scheduled'
	},
	new_review: {
		priority: 'normal',
		defaultVisible: false,
		batchable: false,
		requireInteraction: false,
		route: (id) => `/reputation/reviews/${id}`,
		label: 'New review received',
		description: 'A customer left you a review'
	},
	negative_feedback: {
		priority: 'normal',
		defaultVisible: false,
		batchable: false,
		requireInteraction: false,
		route: (id) => `/reputation/feedback/${id}`,
		label: 'Negative feedback received',
		description: 'A customer sent private feedback'
	},
	quote_declined: {
		priority: 'normal',
		defaultVisible: false,
		batchable: false,
		requireInteraction: false,
		route: (id) => `/quotes/${id}`,
		label: 'Quote declined',
		description: 'A customer declined your quote'
	},
	quote_changes_requested: {
		priority: 'normal',
		defaultVisible: false,
		batchable: false,
		requireInteraction: false,
		route: (id) => `/quotes/${id}`,
		label: 'Changes requested',
		description: 'A customer asked for changes to their quote'
	},
	quote_expired: {
		priority: 'high',
		defaultVisible: true,
		batchable: false,
		requireInteraction: false,
		route: (id) => `/quotes/${id}`,
		label: 'Quote expired',
		description: 'A quote passed its validity date — extend, resend, or mark it lost'
	},
	contact_follow_up_due: {
		priority: 'high',
		defaultVisible: false,
		batchable: false,
		requireInteraction: false,
		route: (id) => `/contacts/${id}`,
		label: 'Follow-up due',
		description: 'A follow-up you scheduled is due'
	},
	opportunity_follow_up_due: {
		priority: 'high',
		defaultVisible: false,
		batchable: false,
		requireInteraction: false,
		// Deep-link opens the deal's detail sheet on the board (auto-opened on mount).
		route: (id) => `/pipeline?deal=${id}`,
		label: 'Deal follow-up due',
		description: 'A follow-up you scheduled on a deal is due'
	},
	opportunity_stale_digest: {
		priority: 'normal',
		defaultVisible: true,
		batchable: false,
		requireInteraction: false,
		// Org-level digest — links to the board so they can action the deals.
		route: () => '/pipeline',
		label: 'Deals need follow-up',
		description: 'Some open deals have no follow-up scheduled'
	},
	contact_import_completed: {
		priority: 'normal',
		defaultVisible: true,
		batchable: false,
		requireInteraction: false,
		// No import-history view yet (Stage 3) — land on the contacts list, where the
		// freshly imported contacts now appear.
		route: () => '/contacts',
		label: 'Contact import finished',
		description: 'Your contact import finished processing'
	},
	growth_feed_update: {
		priority: 'silent',
		defaultVisible: false,
		batchable: true,
		requireInteraction: false,
		route: (id) => `/growth/${id}`,
		label: 'Growth update',
		description: 'New activity in your growth feed'
	},
	sms_credit_low: {
		priority: 'high',
		defaultVisible: true,
		batchable: false,
		requireInteraction: false,
		// Static route — the contractor's read-only balance lives on automation settings.
		route: () => '/settings/automation',
		label: 'SMS credit low',
		description: 'Your texting credit is running low'
	}
};
