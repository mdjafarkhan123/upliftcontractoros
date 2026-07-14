import { and, asc, eq, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import { jobFormFields, jobFormTemplates, orgMembers } from '$lib/server/db/schema';

// Serialized shape returned to the client for one form template + its fields.
export type JobFormFieldPayload = {
	id: string;
	field_type: string;
	label: string;
	help_text: string | null;
	required: boolean;
	options: string[] | null;
	position: number;
};

export type JobFormTemplatePayload = {
	id: string;
	name: string;
	description: string | null;
	created_by_name: string | null;
	created_at: string;
	updated_at: string;
	fields: JobFormFieldPayload[];
};

// Load a single template + its live fields (ordered), scoped to the org. Returns null
// when the template doesn't exist, belongs to another org, or is soft-deleted.
export async function loadJobFormTemplate(
	orgId: string,
	templateId: string
): Promise<JobFormTemplatePayload | null> {
	const [tpl] = await db
		.select({
			id: jobFormTemplates.id,
			name: jobFormTemplates.name,
			description: jobFormTemplates.description,
			created_by_name: orgMembers.full_name,
			created_at: jobFormTemplates.created_at,
			updated_at: jobFormTemplates.updated_at
		})
		.from(jobFormTemplates)
		.leftJoin(orgMembers, eq(orgMembers.id, jobFormTemplates.created_by))
		.where(
			and(
				eq(jobFormTemplates.id, templateId),
				eq(jobFormTemplates.org_id, orgId),
				isNull(jobFormTemplates.deleted_at)
			)
		)
		.limit(1);

	if (!tpl) return null;

	const fields = await db
		.select({
			id: jobFormFields.id,
			field_type: jobFormFields.field_type,
			label: jobFormFields.label,
			help_text: jobFormFields.help_text,
			required: jobFormFields.required,
			options: jobFormFields.options,
			position: jobFormFields.position
		})
		.from(jobFormFields)
		.where(
			and(
				eq(jobFormFields.template_id, templateId),
				eq(jobFormFields.org_id, orgId),
				isNull(jobFormFields.deleted_at)
			)
		)
		.orderBy(asc(jobFormFields.position));

	return {
		id: tpl.id,
		name: tpl.name,
		description: tpl.description,
		created_by_name: tpl.created_by_name,
		created_at: tpl.created_at.toISOString(),
		updated_at: tpl.updated_at.toISOString(),
		fields: fields.map((f) => ({
			id: f.id,
			field_type: f.field_type,
			label: f.label,
			help_text: f.help_text,
			required: f.required,
			options: f.options ?? null,
			position: Number(f.position)
		}))
	};
}
