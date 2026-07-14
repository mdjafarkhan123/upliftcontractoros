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
	'manage_link',
	'job_title',
	'scheduled_datetime'
] as const;
export type AllowedTemplateVariable = (typeof ALLOWED_TEMPLATE_VARIABLES)[number];

const VAR_RE = /\{([a-zA-Z0-9_]+)\}/g;

export type TemplateValidation = { ok: true } | { ok: false; unknown: string[] };

export function validateTemplateVariables(template: string): TemplateValidation {
	return validateTemplateVariablesAgainst(template, ALLOWED_TEMPLATE_VARIABLES);
}

// Validate a template against an explicit allow-list. The engine-backed
// automation cards (Stage 3.d) each support a different set of wired variables
// (e.g. quote/invoice vars), so they validate against their card's allowed set
// rather than the narrow global default above.
export function validateTemplateVariablesAgainst(
	template: string,
	allowedVars: readonly string[]
): TemplateValidation {
	const found = new Set<string>();
	let m: RegExpExecArray | null;
	const allowed = new Set<string>(allowedVars);
	VAR_RE.lastIndex = 0;
	while ((m = VAR_RE.exec(template)) !== null) {
		const name = m[1];
		if (!allowed.has(name)) found.add(name);
	}
	if (found.size === 0) return { ok: true };
	return { ok: false, unknown: [...found] };
}
