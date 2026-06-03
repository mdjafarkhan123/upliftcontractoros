export const ALLOWED_TEMPLATE_VARIABLES = [
	'contact_name',
	'org_name',
	'amount',
	'review_link',
	'appointment_datetime',
	'appointment_date',
	'appointment_time',
	'appointment_type',
	'location',
	'location_block',
	'manage_link'
] as const;
export type AllowedTemplateVariable = (typeof ALLOWED_TEMPLATE_VARIABLES)[number];

const VAR_RE = /\{([a-zA-Z0-9_]+)\}/g;

export type TemplateValidation = { ok: true } | { ok: false; unknown: string[] };

export function validateTemplateVariables(template: string): TemplateValidation {
	const found = new Set<string>();
	let m: RegExpExecArray | null;
	const allowed = new Set<string>(ALLOWED_TEMPLATE_VARIABLES);
	while ((m = VAR_RE.exec(template)) !== null) {
		const name = m[1];
		if (!allowed.has(name)) found.add(name);
	}
	if (found.size === 0) return { ok: true };
	return { ok: false, unknown: [...found] };
}
