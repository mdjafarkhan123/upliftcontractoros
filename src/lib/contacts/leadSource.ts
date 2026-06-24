// Lead source — where a contact came from. Mirrors the `lead_source_type` enum
// in src/lib/server/db/schema/02_contacts.ts. Shared vocabulary + display labels
// used by the list filter control and the detail header chip. Keep this list in
// sync with the DB enum; the order here is the order shown in the filter.

export const LEAD_SOURCES = [
	'website_form',
	'live_chat',
	'inbound_email',
	'missed_call',
	'manual',
	'referral',
	'google_ads',
	'yelp',
	'angi',
	'facebook',
	'nextdoor',
	'door_hanger',
	'job_sign',
	'repeat_customer',
	'other'
] as const;

export type LeadSource = (typeof LEAD_SOURCES)[number];

export const LEAD_SOURCE_LABELS: Record<LeadSource, string> = {
	website_form: 'Website form',
	live_chat: 'Live chat',
	inbound_email: 'Inbound email',
	missed_call: 'Missed call',
	manual: 'Manual',
	referral: 'Referral',
	google_ads: 'Google Ads',
	yelp: 'Yelp',
	angi: 'Angi',
	facebook: 'Facebook',
	nextdoor: 'Nextdoor',
	door_hanger: 'Door hanger',
	job_sign: 'Job sign',
	repeat_customer: 'Repeat customer',
	other: 'Other'
};

export function isLeadSource(v: unknown): v is LeadSource {
	return typeof v === 'string' && (LEAD_SOURCES as readonly string[]).includes(v);
}

/** Display label for any stored source string; falls back gracefully. */
export function leadSourceLabel(v: string | null | undefined): string {
	if (!v) return 'Unknown';
	return isLeadSource(v) ? LEAD_SOURCE_LABELS[v] : 'Other';
}
