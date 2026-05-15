let cached: Set<string> | null = null;

function supportedZones(): Set<string> {
	if (cached) return cached;
	const anyIntl = Intl as unknown as { supportedValuesOf?: (k: string) => string[] };
	if (typeof anyIntl.supportedValuesOf === 'function') {
		cached = new Set(anyIntl.supportedValuesOf('timeZone'));
	} else {
		cached = new Set();
	}
	return cached;
}

export function isValidIanaTimezone(value: unknown): value is string {
	if (typeof value !== 'string' || value.length === 0) return false;
	const zones = supportedZones();
	if (zones.size > 0) return zones.has(value);
	try {
		new Intl.DateTimeFormat('en-US', { timeZone: value });
		return true;
	} catch {
		return false;
	}
}
