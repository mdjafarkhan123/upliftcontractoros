import { parsePhoneNumber, isValidPhoneNumber } from 'libphonenumber-js';

export function toE164(raw: string, defaultCountry: 'US' | 'CA' = 'US'): string | null {
	try {
		if (!raw?.trim()) return null;
		if (!isValidPhoneNumber(raw, defaultCountry)) return null;
		return parsePhoneNumber(raw, defaultCountry).format('E.164');
	} catch {
		return null;
	}
}

export function formatPhoneDisplay(e164: string): string {
	try {
		return parsePhoneNumber(e164).formatNational();
	} catch {
		return e164;
	}
}
