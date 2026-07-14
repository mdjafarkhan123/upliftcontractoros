// Remix icon class + accent colour for each automation card (engine + flat).
// Kept separate from cardDefinitions.ts because the definition module is
// imported on the server too; this file is presentation-only (icon classes).

import type { StepChannel } from '$lib/automation/cardDefinitions';

export type AccentKey =
	| 'amber'
	| 'rose'
	| 'blue'
	| 'emerald'
	| 'violet'
	| 'orange'
	| 'sky'
	| 'teal'
	| 'green';

export type CardVisual = { icon: string; accent: AccentKey };

// Keyed by automation key. Includes the flat (non-engine) cards which use their
// own keys: 'appointment_confirmation', 'review_funnel', 'payment_receipt'.
// `icon` is a Remix icon class string rendered as `<i class={icon}>`.
export const CARD_VISUALS: Record<string, CardVisual> = {
	speed_to_lead: { icon: 'ri-flashlight-line', accent: 'amber' },
	missed_call: { icon: 'ri-phone-line', accent: 'rose' },
	quote_followup: { icon: 'ri-file-text-line', accent: 'blue' },
	invoice_dunning: { icon: 'ri-bill-line', accent: 'emerald' },
	appointment_reminder: { icon: 'ri-calendar-todo-line', accent: 'violet' },
	appointment_no_show: { icon: 'ri-calendar-close-line', accent: 'orange' },
	appointment_quote_nudge: { icon: 'ri-notification-3-line', accent: 'sky' },
	appointment_confirmation: { icon: 'ri-calendar-check-line', accent: 'teal' },
	job_scheduled_confirmation: { icon: 'ri-briefcase-line', accent: 'blue' },
	job_on_my_way: { icon: 'ri-truck-line', accent: 'sky' },
	review_funnel: { icon: 'ri-star-line', accent: 'amber' },
	payment_receipt: { icon: 'ri-receipt-line', accent: 'green' }
};

// Remix icon class per delivery channel, used by the channel picker (sequence
// default + per-step override).
export const CHANNEL_VISUALS: Record<StepChannel, string> = {
	sms_first: 'ri-message-2-line',
	email_first: 'ri-mail-line',
	both: 'ri-send-plane-line',
	sms_only: 'ri-message-2-line',
	email_only: 'ri-mail-line'
};
