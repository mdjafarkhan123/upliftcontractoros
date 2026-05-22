export function interpolate(
	template: string,
	vars: { contact_name?: string | null; org_name?: string | null; amount?: string | null }
): string {
	return template
		.replaceAll('{contact_name}', vars.contact_name ?? '')
		.replaceAll('{org_name}', vars.org_name ?? '')
		.replaceAll('{amount}', vars.amount ?? '');
}
