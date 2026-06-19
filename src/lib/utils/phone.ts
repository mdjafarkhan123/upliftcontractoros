import { parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js';

/**
 * Sentinel prefix used to "release" a soft-deleted contact's reserved phone
 * number without dropping the `(org_id, phone)` UNIQUE constraint or adding a
 * dedicated column in v1. When Admin invokes POST /api/contacts/[id]/release-phone,
 * the stored value becomes:
 *
 *   RELEASED:<contact_id>:<original_e164>
 *
 * Rules enforced everywhere phone values are read:
 *   - Released values MUST NOT appear in UI
 *   - Released values MUST NOT be searchable
 *   - Released values MUST NOT be used for outbound SMS or calls
 *   - Phone normalization MUST reject released values
 */
export const RELEASED_PHONE_PREFIX = 'RELEASED:';

export const PHONE_INVALID_MESSAGE =
	'Enter a valid phone number with country code (e.g. +1 555-123-4567)';

export class PhoneInvalidError extends Error {
	constructor() {
		super(PHONE_INVALID_MESSAGE);
		this.name = 'PhoneInvalidError';
	}
}

export function isReleasedPhone(value: string | null | undefined): boolean {
	return !!value && value.startsWith(RELEASED_PHONE_PREFIX);
}

/**
 * Normalize a valid international phone number to E.164.
 *
 * The number MUST include a leading '+' and country code. National-only
 * formats are rejected because no default country is assumed — the country
 * code is the only reliable disambiguator across all locales.
 *
 * Throws PhoneInvalidError with a single user-friendly message on any failure.
 */
export function toE164(raw: string): string {
	if (!raw || !raw.trim() || isReleasedPhone(raw)) {
		throw new PhoneInvalidError();
	}

	const trimmed = raw.trim();
	if (!trimmed.startsWith('+')) throw new PhoneInvalidError();

	const digits = trimmed.slice(1).replace(/\D+/g, '');
	if (!digits) throw new PhoneInvalidError();

	try {
		const parsed = parsePhoneNumberFromString(`+${digits}`);
		if (!parsed || !parsed.isValid()) throw new PhoneInvalidError();
		return parsed.format('E.164');
	} catch (e) {
		if (e instanceof PhoneInvalidError) throw e;
		throw new PhoneInvalidError();
	}
}

/**
 * Lenient E.164 normalization for bulk CSV import. Unlike toE164, this accepts a
 * national-format number (e.g. "738-551-9969") by interpreting it against a
 * default country (the org's ISO country, falling back to caller's choice). It
 * NEVER throws — an unparseable/invalid number returns null so the caller can
 * decide what to do (we import the contact without a phone and flag the row).
 * A fully-international "+..." number is still honored regardless of country.
 */
export function toE164Loose(raw: string, defaultCountry?: string): string | null {
	if (!raw || !raw.trim() || isReleasedPhone(raw)) return null;
	try {
		const parsed = parsePhoneNumberFromString(
			raw.trim(),
			defaultCountry as CountryCode | undefined
		);
		if (parsed && parsed.isValid()) return parsed.format('E.164');
	} catch {
		// fall through to null
	}
	return null;
}

export function formatPhoneDisplay(e164: string | null | undefined): string {
	if (!e164 || isReleasedPhone(e164)) return '';
	const parsed = parsePhoneNumberFromString(e164);
	return parsed ? parsed.formatInternational() : e164;
}

/**
 * Build the released-phone sentinel for a contact.
 * Called by /api/contacts/[id]/release-phone only.
 */
export function buildReleasedPhone(contactId: string, originalE164: string): string {
	return `${RELEASED_PHONE_PREFIX}${contactId}:${originalE164}`;
}
