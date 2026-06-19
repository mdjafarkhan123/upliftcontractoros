// Icon + accent colour for each automation card (engine + flat). Kept separate
// from cardDefinitions.ts because icons are Svelte components and the definition
// module is imported on the server too.

import type { Component } from 'svelte';
import {
	Zap,
	PhoneMissed,
	FileText,
	ReceiptText,
	CalendarClock,
	CalendarX,
	BellRing,
	CalendarCheck,
	Star,
	Receipt,
	MessageSquare,
	Mail,
	Send
} from '@lucide/svelte';
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

export type CardVisual = { icon: Component; accent: AccentKey };

// Keyed by automation key. Includes the flat (non-engine) cards which use their
// own keys: 'appointment_confirmation', 'review_funnel', 'payment_receipt'.
export const CARD_VISUALS: Record<string, CardVisual> = {
	speed_to_lead: { icon: Zap, accent: 'amber' },
	missed_call: { icon: PhoneMissed, accent: 'rose' },
	quote_followup: { icon: FileText, accent: 'blue' },
	invoice_dunning: { icon: ReceiptText, accent: 'emerald' },
	appointment_reminder: { icon: CalendarClock, accent: 'violet' },
	appointment_no_show: { icon: CalendarX, accent: 'orange' },
	appointment_quote_nudge: { icon: BellRing, accent: 'sky' },
	appointment_confirmation: { icon: CalendarCheck, accent: 'teal' },
	review_funnel: { icon: Star, accent: 'amber' },
	payment_receipt: { icon: Receipt, accent: 'green' }
};

// Tailwind classes for the icon tile background + text, light + dark.
const ACCENT_TILE: Record<AccentKey, string> = {
	amber: 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400',
	rose: 'bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400',
	blue: 'bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400',
	emerald: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400',
	violet: 'bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-400',
	orange: 'bg-orange-50 text-orange-600 dark:bg-orange-500/10 dark:text-orange-400',
	sky: 'bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-400',
	teal: 'bg-teal-50 text-teal-600 dark:bg-teal-500/10 dark:text-teal-400',
	green: 'bg-green-50 text-green-600 dark:bg-green-500/10 dark:text-green-400'
};

export function accentTile(accent: AccentKey): string {
	return ACCENT_TILE[accent];
}

// Icon per delivery channel, used by the channel picker (sequence default +
// per-step override). Kept here with the other Svelte-component icons.
export const CHANNEL_VISUALS: Record<StepChannel, Component> = {
	sms_first: MessageSquare,
	email_first: Mail,
	both: Send,
	sms_only: MessageSquare,
	email_only: Mail
};
