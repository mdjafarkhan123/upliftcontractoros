import { NOTIFICATION_SPEC } from '$lib/notifications/spec';
import type { NotificationType, NotificationPriority } from '$lib/notifications/types';

// The four delivery channels a member can receive an internal alert on.
export type Channel = 'in_app' | 'push' | 'email' | 'sms';

export type ResolvedChannels = {
	in_app: boolean;
	push: boolean;
	email: boolean;
	sms: boolean;
};

// A member's per-type channel preference (their own choices for this alert type).
export type ChannelPref = {
	in_app_enabled: boolean;
	push_enabled: boolean;
	email_enabled: boolean;
	sms_enabled: boolean;
};

// The admin ceiling + status context for a member (from org_members). The resolver is
// pure: the caller loads these once and passes them in. `has_notification_phone` is true
// only when notification_phone is a non-empty E.164 string.
export type MemberNotificationStatus = 'in_office' | 'on_job' | 'deep_work' | 'off_duty';

export type MemberNotificationGate = {
	sms_notifications_allowed: boolean;
	email_notifications_allowed: boolean;
	has_notification_phone: boolean;
	notification_status: MemberNotificationStatus;
};

// Status → channel CEILING per priority bucket (approved Stage 1.b matrix). A channel can
// only deliver if it appears here for the member's current status + the alert's priority.
// SMS only ever appears under critical/high — never normal/silent (architecture rule:
// SMS = real Twilio money, offered only for critical/high types).
const STATUS_CEILING: Record<
	MemberNotificationStatus,
	Record<NotificationPriority, ReadonlyArray<Channel>>
> = {
	in_office: {
		critical: ['in_app', 'push', 'email'],
		high: ['in_app', 'push', 'email'],
		normal: ['in_app', 'push'],
		silent: ['in_app']
	},
	on_job: {
		critical: ['in_app', 'push', 'email', 'sms'],
		high: ['in_app', 'push', 'email', 'sms'],
		normal: ['in_app', 'push'],
		silent: ['in_app']
	},
	deep_work: {
		critical: ['push', 'sms'],
		high: ['in_app', 'push'],
		normal: ['in_app'],
		silent: ['in_app']
	},
	off_duty: {
		critical: ['push', 'sms'],
		high: ['in_app'],
		normal: ['in_app'],
		silent: ['in_app']
	}
};

/**
 * Pure channel resolver. Returns the set of channels a member should receive a given
 * notification type on, by stacking three filters — a channel is ON only when ALL agree:
 *   1. Per-type preference (`pref`) — what the member chose for this alert type.
 *   2. Status ceiling — their current "My Status" narrows channels for this priority.
 *   3. Admin gate — SMS/email allowances on org_members (one-way: admin OFF wins).
 * Plus the hard rule: SMS only for critical/high priority, and only with a phone on file.
 *
 * No DB, no side effects — safe to unit-test across status × gate × pref combos (1.b accept).
 */
export function resolveChannels(
	type: NotificationType,
	pref: ChannelPref,
	gate: MemberNotificationGate
): ResolvedChannels {
	const priority: NotificationPriority = NOTIFICATION_SPEC[type]?.priority ?? 'normal';
	const ceiling = STATUS_CEILING[gate.notification_status][priority];
	const allowed = (c: Channel) => ceiling.includes(c);

	const smsPriorityOk = priority === 'critical' || priority === 'high';

	return {
		in_app: pref.in_app_enabled && allowed('in_app'),
		push: pref.push_enabled && allowed('push'),
		email: pref.email_enabled && allowed('email') && gate.email_notifications_allowed,
		sms:
			pref.sms_enabled &&
			allowed('sms') &&
			smsPriorityOk &&
			gate.sms_notifications_allowed &&
			gate.has_notification_phone
	};
}
