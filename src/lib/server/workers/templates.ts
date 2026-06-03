export type TemplateVars = {
	contact_name?: string | null;
	org_name?: string | null;
	amount?: string | null;
	review_link?: string | null;
	appointment_datetime?: string | null;
	appointment_date?: string | null;
	appointment_time?: string | null;
	appointment_type?: string | null;
	location?: string | null;
	location_block?: string | null;
	manage_link?: string | null;
};

export function interpolate(template: string, vars: TemplateVars): string {
	return template
		.replaceAll('{contact_name}', vars.contact_name ?? '')
		.replaceAll('{org_name}', vars.org_name ?? '')
		.replaceAll('{amount}', vars.amount ?? '')
		.replaceAll('{review_link}', vars.review_link ?? '')
		.replaceAll('{appointment_datetime}', vars.appointment_datetime ?? '')
		.replaceAll('{appointment_date}', vars.appointment_date ?? '')
		.replaceAll('{appointment_time}', vars.appointment_time ?? '')
		.replaceAll('{appointment_type}', vars.appointment_type ?? '')
		.replaceAll('{location}', vars.location ?? '')
		.replaceAll('{location_block}', vars.location_block ?? '')
		.replaceAll('{manage_link}', vars.manage_link ?? '');
}
