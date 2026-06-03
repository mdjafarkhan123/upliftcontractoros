// Contact tags vs status — DO NOT MIX.
//
// `contacts.status` (enum: lead | customer | archived) is the lifecycle.
// `contacts.tags` (text[]) are operational descriptors layered on top.
// Never seed `lead` or `customer` as tag values — that would create two
// sources of truth for the same fact and break filters.
//
// Suggested vocabulary surfaced in the editor + list filter. Free-text
// tags are allowed by the schema (max 20 × 50 chars) but only the
// suggestions appear as chips in the UI.
export const SUGGESTED_CONTACT_TAGS = [
	'homeowner',
	'company',
	'referral-source',
	'vip',
	'hot',
	'cold',
	'do-not-call'
] as const;

export type SuggestedContactTag = (typeof SUGGESTED_CONTACT_TAGS)[number];

export function formatTagLabel(tag: string): string {
	return tag
		.split('-')
		.map((p) => (p.length === 0 ? p : p[0].toUpperCase() + p.slice(1)))
		.join(' ');
}

export function isDestructiveTag(tag: string): boolean {
	return tag === 'do-not-call';
}
