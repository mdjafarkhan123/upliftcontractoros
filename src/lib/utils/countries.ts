// ISO 3166-1 alpha-2 country list for onboarding (Business Profile, Step 2).
// The stored `organizations.country` drives phone availability and carrier
// approval requirements (US 10DLC, Canada CWTA) in later onboarding steps.
//
// `PRIMARY_COUNTRY_CODES` are the markets surfaced first in the picker. The
// rest follow alphabetically. Validation (isValidCountry) is the single source
// of truth shared by the wizard UI and the server route.

export interface CountryOption {
	code: string; // ISO 3166-1 alpha-2, uppercase (e.g. 'US')
	name: string;
}

// Surfaced at the top of the picker — the actively supported SMS markets.
export const PRIMARY_COUNTRY_CODES = ['US', 'CA', 'GB', 'AU'] as const;

const ALL_COUNTRIES: CountryOption[] = [
	{ code: 'US', name: 'United States' },
	{ code: 'CA', name: 'Canada' },
	{ code: 'GB', name: 'United Kingdom' },
	{ code: 'AU', name: 'Australia' },
	{ code: 'AE', name: 'United Arab Emirates' },
	{ code: 'AR', name: 'Argentina' },
	{ code: 'AT', name: 'Austria' },
	{ code: 'BD', name: 'Bangladesh' },
	{ code: 'BE', name: 'Belgium' },
	{ code: 'BR', name: 'Brazil' },
	{ code: 'CH', name: 'Switzerland' },
	{ code: 'CL', name: 'Chile' },
	{ code: 'CN', name: 'China' },
	{ code: 'CO', name: 'Colombia' },
	{ code: 'CZ', name: 'Czechia' },
	{ code: 'DE', name: 'Germany' },
	{ code: 'DK', name: 'Denmark' },
	{ code: 'EG', name: 'Egypt' },
	{ code: 'ES', name: 'Spain' },
	{ code: 'FI', name: 'Finland' },
	{ code: 'FR', name: 'France' },
	{ code: 'GR', name: 'Greece' },
	{ code: 'HK', name: 'Hong Kong' },
	{ code: 'HU', name: 'Hungary' },
	{ code: 'ID', name: 'Indonesia' },
	{ code: 'IE', name: 'Ireland' },
	{ code: 'IL', name: 'Israel' },
	{ code: 'IN', name: 'India' },
	{ code: 'IT', name: 'Italy' },
	{ code: 'JP', name: 'Japan' },
	{ code: 'KE', name: 'Kenya' },
	{ code: 'KR', name: 'South Korea' },
	{ code: 'MX', name: 'Mexico' },
	{ code: 'MY', name: 'Malaysia' },
	{ code: 'NG', name: 'Nigeria' },
	{ code: 'NL', name: 'Netherlands' },
	{ code: 'NO', name: 'Norway' },
	{ code: 'NZ', name: 'New Zealand' },
	{ code: 'PH', name: 'Philippines' },
	{ code: 'PK', name: 'Pakistan' },
	{ code: 'PL', name: 'Poland' },
	{ code: 'PT', name: 'Portugal' },
	{ code: 'RO', name: 'Romania' },
	{ code: 'SA', name: 'Saudi Arabia' },
	{ code: 'SE', name: 'Sweden' },
	{ code: 'SG', name: 'Singapore' },
	{ code: 'TH', name: 'Thailand' },
	{ code: 'TR', name: 'Türkiye' },
	{ code: 'TW', name: 'Taiwan' },
	{ code: 'UA', name: 'Ukraine' },
	{ code: 'VN', name: 'Vietnam' },
	{ code: 'ZA', name: 'South Africa' }
];

const PRIMARY_SET = new Set<string>(PRIMARY_COUNTRY_CODES);

// Primary markets first (in PRIMARY_COUNTRY_CODES order), then the rest A→Z by name.
export const COUNTRY_OPTIONS: CountryOption[] = [
	...PRIMARY_COUNTRY_CODES.map((code) => ALL_COUNTRIES.find((c) => c.code === code)!),
	...ALL_COUNTRIES.filter((c) => !PRIMARY_SET.has(c.code)).sort((a, b) =>
		a.name.localeCompare(b.name)
	)
];

const CODE_SET = new Set(ALL_COUNTRIES.map((c) => c.code));

export function isValidCountry(code: string): boolean {
	return CODE_SET.has(code);
}

export function countryName(code: string | null | undefined): string | null {
	if (!code) return null;
	return ALL_COUNTRIES.find((c) => c.code === code)?.name ?? null;
}

// ── SMS support classification (Onboarding.md Part 9) ────────────────────────
// Every country in the business-profile picker is an SMS-supported market — we
// offer number provisioning in all of them. US & Canada additionally require
// carrier registration (10DLC / CWTA) before OUTBOUND SMS, so they are "gated"
// until approved (inbound + calls work immediately). A country we don't
// recognise (null, or a legacy / removed code) is "unsupported" — we surface
// "SMS not available in your region" instead of a setup flow Twilio would only
// reject. Twilio remains the authoritative gate; this is a UX / safety pre-filter.

export type SmsCountrySupport = 'gated' | 'supported' | 'unsupported';

// Markets that need carrier approval before outbound SMS.
export const SMS_GATED_COUNTRY_CODES = ['US', 'CA'] as const;
const SMS_GATED_SET = new Set<string>(SMS_GATED_COUNTRY_CODES);

export function smsCountrySupport(code: string | null | undefined): SmsCountrySupport {
	if (!code || !CODE_SET.has(code)) return 'unsupported';
	return SMS_GATED_SET.has(code) ? 'gated' : 'supported';
}

// True when we should offer the "set up a number" flow for this country.
export function isSmsSupportedCountry(code: string | null | undefined): boolean {
	return smsCountrySupport(code) !== 'unsupported';
}
