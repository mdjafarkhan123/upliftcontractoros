import { getCountryCallingCode, type CountryCode } from 'libphonenumber-js';
import { COUNTRY_OPTIONS } from './countries';

/**
 * Country rows for the PhoneField dropdown — flag emoji + dial code, ordered
 * primary markets first (US, CA, GB, AU) then A→Z, matching COUNTRY_OPTIONS.
 * Built once at import from the shared onboarding country list so the phone
 * picker and the business-profile picker never drift.
 */
export interface PhoneCountry {
	code: string; // ISO 3166-1 alpha-2, uppercase
	name: string;
	dial: string; // "+1", "+44", …
	flag: string; // 🇺🇸
}

// Regional-indicator flag emoji from an ISO alpha-2 code.
function flagEmoji(code: string): string {
	return code
		.toUpperCase()
		.replace(/./g, (c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65));
}

export const PHONE_COUNTRIES: PhoneCountry[] = COUNTRY_OPTIONS.map((c) => ({
	code: c.code,
	name: c.name,
	dial: `+${getCountryCallingCode(c.code as CountryCode)}`,
	flag: flagEmoji(c.code)
}));

const BY_CODE = new Map(PHONE_COUNTRIES.map((c) => [c.code, c]));

export function phoneCountry(code: string | null | undefined): PhoneCountry | undefined {
	return code ? BY_CODE.get(code.toUpperCase()) : undefined;
}
