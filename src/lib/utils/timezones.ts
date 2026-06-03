// Build IANA timezone list with friendly labels + current UTC offsets.
// Source of truth: Intl.supportedValuesOf('timeZone') — the same set
// Intl.DateTimeFormat will accept, so we can never store an invalid value.

export interface TimezoneOption {
	id: string; // IANA id, e.g. "Asia/Dhaka"
	region: string; // "Asia"
	city: string; // "Dhaka" (last segment, underscores → spaces)
	offsetMinutes: number; // current UTC offset in minutes (DST-aware)
	offsetLabel: string; // "UTC+06:00"
	searchKey: string; // pre-lowercased, used for filtering
}

// Precomputed at module import so the first dropdown open is instant —
// no per-click 400× Intl.DateTimeFormat work. The build itself is a few
// dozen ms on first JS parse, amortized once across the session.
let cached: TimezoneOption[] | null = null;

function formatOffset(minutes: number): string {
	const sign = minutes >= 0 ? '+' : '-';
	const abs = Math.abs(minutes);
	const h = String(Math.floor(abs / 60)).padStart(2, '0');
	const m = String(abs % 60).padStart(2, '0');
	return `UTC${sign}${h}:${m}`;
}

function computeOffsetMinutes(tz: string, now: Date): number {
	// Format the same instant in UTC and the target zone, then diff.
	const fmt = new Intl.DateTimeFormat('en-US', {
		timeZone: tz,
		hourCycle: 'h23',
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit'
	});
	const parts = fmt.formatToParts(now);
	const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
	const asUtcMs = Date.UTC(
		get('year'),
		get('month') - 1,
		get('day'),
		get('hour'),
		get('minute'),
		get('second')
	);
	return Math.round((asUtcMs - now.getTime()) / 60000);
}

function cityFromId(id: string): string {
	const last = id.split('/').pop() ?? id;
	return last.replace(/_/g, ' ');
}

function regionFromId(id: string): string {
	return id.split('/')[0] ?? '';
}

function buildTimezoneOptions(): TimezoneOption[] {
	const anyIntl = Intl as unknown as { supportedValuesOf?: (k: string) => string[] };
	const ids =
		typeof anyIntl.supportedValuesOf === 'function' ? anyIntl.supportedValuesOf('timeZone') : [];
	const now = new Date();
	const opts: TimezoneOption[] = ids.map((id) => {
		const region = regionFromId(id);
		const city = cityFromId(id);
		const offsetMinutes = computeOffsetMinutes(id, now);
		const offsetLabel = formatOffset(offsetMinutes);
		return {
			id,
			region,
			city,
			offsetMinutes,
			offsetLabel,
			searchKey: `${id} ${city} ${region} ${offsetLabel}`.toLowerCase()
		};
	});
	// Sort by region, then city — nice grouping in the dropdown.
	opts.sort((a, b) => a.region.localeCompare(b.region) || a.city.localeCompare(b.city));
	return opts;
}

// Eager build at module load. Browsers run this off the critical path while
// the org-settings fetch is in flight, so by the time the user clicks the
// dropdown the list is already in memory.
if (typeof window !== 'undefined') {
	cached = buildTimezoneOptions();
}

export function getTimezoneOptions(): TimezoneOption[] {
	if (cached) return cached;
	cached = buildTimezoneOptions();
	return cached;
}

export function findTimezoneOption(id: string | null | undefined): TimezoneOption | null {
	if (!id) return null;
	return getTimezoneOptions().find((o) => o.id === id) ?? null;
}

export function detectBrowserTimezone(): string | null {
	try {
		return Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
	} catch {
		return null;
	}
}
