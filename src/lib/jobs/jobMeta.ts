// Suggested vocabulary for jobs — surfaced as presets in the New Job form. Both job_type and
// tags accept free text at the schema level; only these suggestions appear as one-tap chips.
// Mirrors the contacts/tags.ts pattern.

// Common contractor work categories across trades (fence, lawn, HVAC, plumbing, electrical,
// cleaning, roofing, remodel, junk removal, …). Stored free-text in jobs.job_type.
export const SUGGESTED_JOB_TYPES = [
	'Repair',
	'Installation',
	'Maintenance',
	'Inspection',
	'Service Call',
	'Cleanup',
	'Estimate',
	'Warranty'
] as const;

export type SuggestedJobType = (typeof SUGGESTED_JOB_TYPES)[number];

// Operational descriptors layered on a job (stored in jobs.tags, text[]).
export const SUGGESTED_JOB_TAGS = [
	'urgent',
	'callback',
	'follow-up',
	'warranty',
	'materials-needed',
	'permit-required'
] as const;

export type SuggestedJobTag = (typeof SUGGESTED_JOB_TAGS)[number];

// Title-cases a kebab tag for display (mirrors contacts/tags.ts formatTagLabel).
export function formatJobTagLabel(tag: string): string {
	return tag
		.split('-')
		.map((p) => (p.length === 0 ? p : p[0].toUpperCase() + p.slice(1)))
		.join(' ');
}
