// ─────────────────────────────────────────────────────────────────────────────
// Automation card definitions (Stage 3.d.1)
//
// Single source of truth describing the engine-backed automation "cards" that
// the contractor configures in Settings → Automation. Both the settings UI and
// the sequences API import this so rendering and validation never drift.
//
// Each card maps 1:1 to an `automation_sequences` row (by `key`). A card's steps
// map to `automation_sequence_steps`. The engine itself (engine.ts) is generic;
// these definitions encode the per-card *editing rules* the engine can't express
// (which template variables are wired, whether timing is delay- or anchor-based,
// whether the step targets the customer or staff, etc.).
//
// This module is pure data + helpers — safe to import on both client and server.
// ─────────────────────────────────────────────────────────────────────────────

import type { FeatureFlagKey } from '$lib/types';

// Mirrors automationStepChannelEnum in schema/18_automation_engine.ts. Defined
// locally (not imported from $lib/server/*) so the client can use it.
export type StepChannel = 'sms_first' | 'email_first' | 'both' | 'sms_only' | 'email_only';

export const STEP_CHANNELS: { value: StepChannel; label: string; description: string }[] = [
	{ value: 'sms_first', label: 'Text first', description: 'Texts the customer — falls back to email if we have no mobile number.' },
	{ value: 'email_first', label: 'Email first', description: 'Emails the customer — falls back to a text if we have no email address.' },
	{ value: 'both', label: 'Text & email', description: 'Sends both a text and an email on every channel they’ve consented to.' },
	{ value: 'sms_only', label: 'Text only', description: 'Text message only — never falls back to email.' },
	{ value: 'email_only', label: 'Email only', description: 'Email only — never falls back to a text.' }
];

export type TimingMode = 'delay' | 'offset';
export type Audience = 'contact' | 'staff';

export type AutomationCardKey =
	| 'speed_to_lead'
	| 'missed_call'
	| 'quote_followup'
	| 'invoice_dunning'
	| 'appointment_reminder'
	| 'appointment_no_show'
	| 'appointment_quote_nudge';

export type CardCategory = 'Inbound' | 'Follow-ups' | 'Appointments';

export type AutomationCardDef = {
	key: AutomationCardKey;
	title: string;
	description: string;
	category: CardCategory;
	resourceType: 'contact' | 'quote' | 'invoice' | 'appointment';
	// 'delay'  → steps chain forward (delay_minutes from the previous step).
	// 'offset' → steps fire relative to the resource anchor (offset_minutes;
	//            negative = before, e.g. an appointment reminder).
	timingMode: TimingMode;
	audience: Audience;
	channelEditable: boolean;
	allowedChannels: StepChannel[];
	// Template variables this card's bodies may use. Drives the "Insert field"
	// chips AND server-side validation (the global validator is too narrow for
	// resource cards). Order = display order in the chip row.
	allowedVars: string[];
	emailCapable: boolean; // whether email subject/body fields are shown
	featureFlag: FeatureFlagKey; // capability gate (locks the whole card)
	smsAllowedFlag?: FeatureFlagKey; // optional per-plan SMS allowance
	// Step structure rules.
	stepsEditable: boolean; // can the contractor add/remove steps?
	minSteps: number;
	maxSteps: number;
	// position 0 is the instant reply (delay locked to 0) for inbound cards.
	step0Instant: boolean;
	lockedReason: string;
};

const VARS = {
	base: ['contact_name', 'org_name'],
	quote: ['contact_name', 'org_name', 'quote_number', 'quote_amount', 'amount', 'phone'],
	invoice: ['contact_name', 'org_name', 'invoice_number', 'amount', 'payment_link', 'due_date', 'phone'],
	appointment: [
		'contact_name',
		'org_name',
		'appointment_datetime',
		'appointment_date',
		'appointment_time',
		'appointment_type',
		'location',
		'phone'
	]
} as const;

export const AUTOMATION_CARDS: AutomationCardDef[] = [
	{
		key: 'speed_to_lead',
		title: 'Speed to lead',
		description: 'Acknowledge new leads within seconds, then follow up until they reply.',
		category: 'Inbound',
		resourceType: 'contact',
		timingMode: 'delay',
		audience: 'contact',
		channelEditable: true,
		allowedChannels: ['sms_first', 'email_first', 'both', 'sms_only', 'email_only'],
		allowedVars: [...VARS.base],
		emailCapable: true,
		featureFlag: 'feature_speed_to_lead',
		stepsEditable: true,
		minSteps: 1,
		maxSteps: 6,
		step0Instant: true,
		lockedReason: "Speed to lead isn't included in your plan — upgrade to enable"
	},
	{
		key: 'missed_call',
		title: 'Missed call text-back',
		description: 'Text back automatically when a call goes unanswered, then follow up.',
		category: 'Inbound',
		resourceType: 'contact',
		timingMode: 'delay',
		audience: 'contact',
		channelEditable: false,
		allowedChannels: ['sms_only'],
		allowedVars: [...VARS.base],
		emailCapable: false,
		featureFlag: 'feature_missed_call_textback',
		stepsEditable: true,
		minSteps: 1,
		maxSteps: 5,
		step0Instant: true,
		lockedReason: "Missed call text-back isn't included in your plan — upgrade to enable"
	},
	{
		key: 'quote_followup',
		title: 'Quote follow-up',
		description: 'Nudge customers after you send a quote until they accept or decline.',
		category: 'Follow-ups',
		resourceType: 'quote',
		timingMode: 'delay',
		audience: 'contact',
		channelEditable: true,
		allowedChannels: ['sms_first', 'email_first', 'both', 'sms_only', 'email_only'],
		allowedVars: [...VARS.quote],
		emailCapable: true,
		featureFlag: 'feature_quote_followup',
		smsAllowedFlag: 'quote_followup_sms_allowed',
		stepsEditable: true,
		minSteps: 1,
		maxSteps: 5,
		step0Instant: false,
		lockedReason: "Quote follow-up isn't included in your plan — upgrade to enable"
	},
	{
		key: 'invoice_dunning',
		title: 'Invoice reminders',
		description: 'Remind customers about unpaid invoices on a schedule until they pay.',
		category: 'Follow-ups',
		resourceType: 'invoice',
		timingMode: 'delay',
		audience: 'contact',
		channelEditable: true,
		allowedChannels: ['sms_first', 'email_first', 'both', 'sms_only', 'email_only'],
		allowedVars: [...VARS.invoice],
		emailCapable: true,
		featureFlag: 'feature_invoice_reminders',
		smsAllowedFlag: 'invoice_reminder_sms_allowed',
		stepsEditable: true,
		minSteps: 1,
		maxSteps: 6,
		step0Instant: false,
		lockedReason: "Invoice reminders aren't included in your plan — upgrade to enable"
	},
	{
		key: 'appointment_reminder',
		title: 'Appointment reminders',
		description: 'Remind customers before their appointment so fewer slots get missed.',
		category: 'Appointments',
		resourceType: 'appointment',
		timingMode: 'offset',
		audience: 'contact',
		channelEditable: true,
		allowedChannels: ['sms_first', 'email_first', 'both', 'sms_only', 'email_only'],
		allowedVars: [...VARS.appointment],
		emailCapable: true,
		featureFlag: 'feature_appointment_reminders',
		smsAllowedFlag: 'appointment_reminder_sms_allowed',
		stepsEditable: true,
		minSteps: 1,
		maxSteps: 4,
		step0Instant: false,
		lockedReason: "Appointment reminders aren't included in your plan — upgrade to enable"
	},
	{
		key: 'appointment_no_show',
		title: 'No-show follow-up',
		description: "Re-engage customers who miss their appointment and offer to rebook.",
		category: 'Appointments',
		resourceType: 'contact',
		timingMode: 'delay',
		audience: 'contact',
		channelEditable: true,
		allowedChannels: ['sms_first', 'email_first', 'both', 'sms_only', 'email_only'],
		allowedVars: [...VARS.base],
		emailCapable: true,
		featureFlag: 'feature_appointment_reminders',
		smsAllowedFlag: 'appointment_reminder_sms_allowed',
		stepsEditable: true,
		minSteps: 1,
		maxSteps: 4,
		step0Instant: true,
		lockedReason: "Appointment automations aren't included in your plan — upgrade to enable"
	},
	{
		key: 'appointment_quote_nudge',
		title: 'No-quote staff reminder',
		description:
			'After a completed appointment with no quote raised, remind your team to follow up. Sent as an in-app notification to the office and assigned crew.',
		category: 'Appointments',
		resourceType: 'appointment',
		timingMode: 'offset',
		audience: 'staff',
		channelEditable: false,
		allowedChannels: [],
		allowedVars: [
			'contact_name',
			'org_name',
			'appointment_datetime',
			'appointment_date',
			'appointment_time',
			'appointment_type'
		],
		emailCapable: false,
		featureFlag: 'feature_appointment_reminders',
		stepsEditable: false,
		minSteps: 1,
		maxSteps: 1,
		step0Instant: false,
		lockedReason: "Appointment automations aren't included in your plan — upgrade to enable"
	}
];

export const AUTOMATION_CARD_KEYS = AUTOMATION_CARDS.map((c) => c.key);

export function getCardDef(key: string): AutomationCardDef | undefined {
	return AUTOMATION_CARDS.find((c) => c.key === key);
}

// Realistic sample values for the live template preview. Covers every variable
// any card can reference.
export const SAMPLE_VARS: Record<string, string> = {
	contact_name: 'John Smith',
	org_name: 'ABC Roofing',
	amount: '$2,400.00',
	quote_number: '#1042',
	quote_amount: '$2,400.00',
	invoice_number: '#INV-1042',
	payment_link: 'abcroofing.com/pay/x7k2',
	due_date: 'June 20, 2026',
	phone: '(555) 123-4567',
	appointment_datetime: 'Fri, Jun 20, 10:00 AM EDT',
	appointment_date: 'Friday, June 20',
	appointment_time: '10:00 AM EDT',
	appointment_type: 'estimate',
	location: '123 Main St, Springfield'
};

// Human label for a template variable (used by the "Insert field" chips).
export const VAR_LABELS: Record<string, string> = {
	contact_name: 'Contact name',
	org_name: 'Business name',
	amount: 'Amount',
	quote_number: 'Quote #',
	quote_amount: 'Quote total',
	invoice_number: 'Invoice #',
	payment_link: 'Payment link',
	due_date: 'Due date',
	phone: 'Business phone',
	appointment_datetime: 'Date & time',
	appointment_date: 'Date',
	appointment_time: 'Time',
	appointment_type: 'Service type',
	location: 'Location'
};

// Render a template with the sample values (mirror of the server `interpolate`,
// but operating over an arbitrary variable map for the preview only).
export function previewTemplate(template: string): string {
	return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (_, name: string) => SAMPLE_VARS[name] ?? `{${name}}`);
}

// ── Timing presets ───────────────────────────────────────────────────────────
// Delay presets (minutes from the previous step) for forward-chained cards.
export const DELAY_PRESETS: { minutes: number; label: string }[] = [
	{ minutes: 0, label: 'Immediately' },
	{ minutes: 15, label: '15 minutes later' },
	{ minutes: 30, label: '30 minutes later' },
	{ minutes: 60, label: '1 hour later' },
	{ minutes: 120, label: '2 hours later' },
	{ minutes: 240, label: '4 hours later' },
	{ minutes: 1440, label: '1 day later' },
	{ minutes: 2880, label: '2 days later' },
	{ minutes: 4320, label: '3 days later' },
	{ minutes: 10080, label: '1 week later' }
];

// Offset presets for "before the appointment" reminders (stored as NEGATIVE
// offset_minutes).
export const BEFORE_OFFSET_PRESETS: { minutes: number; label: string }[] = [
	{ minutes: -60, label: '1 hour before' },
	{ minutes: -120, label: '2 hours before' },
	{ minutes: -240, label: '4 hours before' },
	{ minutes: -1440, label: '1 day before' },
	{ minutes: -2880, label: '2 days before' }
];

// Offset presets for the post-appointment staff nudge (POSITIVE = after the
// appointment ends).
export const AFTER_OFFSET_PRESETS: { minutes: number; label: string }[] = [
	{ minutes: 60, label: '1 hour after' },
	{ minutes: 120, label: '2 hours after' },
	{ minutes: 240, label: '4 hours after' },
	{ minutes: 1440, label: '1 day after' }
];

// Editable step as carried by the UI. Bodies are always strings here ('' for
// empty) so they bind cleanly to inputs; SequenceCard converts ''→null at the
// API boundary.
export type EditableStep = {
	position: number;
	delay_minutes: number;
	offset_minutes: number | null;
	channel: StepChannel | null;
	audience: Audience;
	condition: string | null;
	sms_body: string;
	email_subject: string;
	email_body: string;
};

export type SequenceConfig = {
	key: AutomationCardKey;
	enabled: boolean;
	channel: StepChannel;
	steps: EditableStep[];
};

export const STEP_DELAY_MAX = 43200; // 30 days in minutes
export const STEP_OFFSET_ABS_MAX = 20160; // 14 days in minutes
export const BODY_MAX = 1000;
export const SUBJECT_MAX = 200;
