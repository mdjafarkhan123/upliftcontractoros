// "My Status" — a member-set state that narrows which channels their internal
// alerts come through (the routing rules in resolveChannels read this).
// This file is icon-free and has NO Svelte/UI imports, so the delivery worker
// (a plain Node process) can import it. The visual presets (icons, colors) live
// in `memberStatusPresets.ts`, which is UI-only.
export type MemberNotificationStatus = 'in_office' | 'on_job' | 'deep_work' | 'off_duty';

export const DEFAULT_MEMBER_STATUS: MemberNotificationStatus = 'in_office';

// "Clear after" — how long a temporary status sticks before auto-reverting to the
// default. The actual expiry instant is computed SERVER-side (org timezone), so the
// client only sends the token; this list is just the UI choices.
export type StatusClearAfter = 'none' | '1h' | '4h' | 'tomorrow';

export const STATUS_CLEAR_OPTIONS: { value: StatusClearAfter; label: string }[] = [
	{ value: 'none', label: "Don't clear" },
	{ value: '1h', label: '1 hour' },
	{ value: '4h', label: '4 hours' },
	{ value: 'tomorrow', label: 'Tomorrow' }
];

/**
 * Resolve the EFFECTIVE status, honoring expiry (auto-revert "on read"). Once
 * `expiresAt` has passed, the member is treated as the default status everywhere —
 * the stored value is harmless because every reader funnels through this. Accepts a
 * Date or an ISO string (the session store carries it as a string after JSON).
 */
export function effectiveStatus(
	status: MemberNotificationStatus,
	expiresAt: string | Date | null | undefined
): MemberNotificationStatus {
	if (!expiresAt) return status;
	const exp = expiresAt instanceof Date ? expiresAt : new Date(expiresAt);
	if (Number.isNaN(exp.getTime())) return status;
	return exp.getTime() <= Date.now() ? DEFAULT_MEMBER_STATUS : status;
}
