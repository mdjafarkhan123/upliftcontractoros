const HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

export function isValidHexColor(value: unknown): value is string {
	return typeof value === 'string' && HEX_RE.test(value);
}

export function normalizeHexColor(value: string): string {
	return value.trim().toLowerCase();
}
