// Format dates in the ORG's timezone (not the browser's). Use these helpers
// wherever an org-owned timestamp is displayed to a contractor — appointments,
// reminders, anything where a Texas user managing a Florida crew should see
// Florida time, not Central.
//
// Mirrors the worker-side approach (see automationWorker.formatAppointmentForOrg)
// so SMS/email and the dashboard render the same wall-clock time.

type DateInput = Date | string | number | null | undefined;

function toDate(d: DateInput): Date | null {
	if (d === null || d === undefined || d === '') return null;
	if (d instanceof Date) return Number.isNaN(d.getTime()) ? null : d;
	const x = new Date(d);
	return Number.isNaN(x.getTime()) ? null : x;
}

// Pass timezone undefined to let Intl fall back to the browser default. We do
// this only as a last resort when the session has not loaded yet.
export function formatInOrgTz(
	d: DateInput,
	timezone: string | null | undefined,
	opts?: Intl.DateTimeFormatOptions
): string {
	const date = toDate(d);
	if (!date) return '';
	try {
		return new Intl.DateTimeFormat('en-US', {
			...opts,
			timeZone: timezone || undefined
		}).format(date);
	} catch {
		// Invalid IANA name — degrade gracefully rather than crash the UI.
		return new Intl.DateTimeFormat('en-US', opts).format(date);
	}
}

export function formatDateTimeInOrgTz(d: DateInput, timezone: string | null | undefined): string {
	return formatInOrgTz(d, timezone, {
		month: 'short',
		day: 'numeric',
		year: 'numeric',
		hour: 'numeric',
		minute: '2-digit',
		timeZoneName: 'short'
	});
}

export function formatDateInOrgTz(d: DateInput, timezone: string | null | undefined): string {
	return formatInOrgTz(d, timezone, {
		weekday: 'short',
		month: 'short',
		day: 'numeric'
	});
}

export function formatTimeInOrgTz(d: DateInput, timezone: string | null | undefined): string {
	return formatInOrgTz(d, timezone, {
		hour: 'numeric',
		minute: '2-digit'
	});
}
