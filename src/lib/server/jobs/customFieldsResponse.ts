import { alias } from 'drizzle-orm/pg-core';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import { jobCustomFields, jobCustomFieldValues, orgMembers } from '$lib/server/db/schema';
import type { JobCustomFieldDef, JobCustomFieldRow, JobCustomFieldType } from '$lib/types/jobs';

/**
 * List the org's live custom-field definitions (for the Settings page), ordered by position
 * then creation. `created_by_name` is joined for display.
 */
export async function loadJobCustomFieldDefs(orgId: string): Promise<JobCustomFieldDef[]> {
	const rows = await db
		.select({
			id: jobCustomFields.id,
			field_type: jobCustomFields.field_type,
			label: jobCustomFields.label,
			help_text: jobCustomFields.help_text,
			required: jobCustomFields.required,
			options: jobCustomFields.options,
			position: jobCustomFields.position,
			created_by_name: orgMembers.full_name,
			created_at: jobCustomFields.created_at,
			updated_at: jobCustomFields.updated_at
		})
		.from(jobCustomFields)
		.leftJoin(orgMembers, eq(orgMembers.id, jobCustomFields.created_by))
		.where(and(eq(jobCustomFields.org_id, orgId), isNull(jobCustomFields.deleted_at)))
		.orderBy(asc(jobCustomFields.position), asc(jobCustomFields.created_at));

	return rows.map((r) => ({
		id: r.id,
		field_type: r.field_type as JobCustomFieldType,
		label: r.label,
		help_text: r.help_text,
		required: r.required,
		options: r.options ?? null,
		position: String(r.position),
		created_by_name: r.created_by_name,
		created_at: r.created_at.toISOString(),
		updated_at: r.updated_at.toISOString()
	}));
}

/**
 * Every live custom-field definition for the org, each merged with THIS job's value (all
 * value_* null when the field has no value yet). Definitions are LIVE (not snapshotted), so a
 * job always shows the current field set. Two reads + an in-memory join — no N+1. Ordered by
 * the definition's position.
 */
export async function loadJobCustomFields(
	orgId: string,
	jobId: string
): Promise<JobCustomFieldRow[]> {
	// PERFORMANCE: the definitions and this job's values are independent (the in-memory join below
	// stitches them), so fetch both in one concurrent wave instead of defs-then-values. When the org
	// has no custom fields the values read simply returns 0 rows (indexed) and we still short-circuit
	// to [] — a negligible cost versus the round-trip saved on every job that DOES use custom fields.
	const [defs, values] = await Promise.all([
		db
			.select({
				id: jobCustomFields.id,
				field_type: jobCustomFields.field_type,
				label: jobCustomFields.label,
				help_text: jobCustomFields.help_text,
				required: jobCustomFields.required,
				options: jobCustomFields.options,
				position: jobCustomFields.position
			})
			.from(jobCustomFields)
			.where(and(eq(jobCustomFields.org_id, orgId), isNull(jobCustomFields.deleted_at)))
			.orderBy(asc(jobCustomFields.position), asc(jobCustomFields.created_at)),

		db
			.select({
				field_id: jobCustomFieldValues.field_id,
				value_text: jobCustomFieldValues.value_text,
				value_number: jobCustomFieldValues.value_number,
				value_bool: jobCustomFieldValues.value_bool,
				value_date: jobCustomFieldValues.value_date
			})
			.from(jobCustomFieldValues)
			.where(and(eq(jobCustomFieldValues.job_id, jobId), eq(jobCustomFieldValues.org_id, orgId)))
	]);

	if (defs.length === 0) return [];

	const valueByField = new Map(values.map((v) => [v.field_id, v]));

	return defs.map((d) => {
		const v = valueByField.get(d.id);
		return {
			id: d.id,
			field_type: d.field_type as JobCustomFieldType,
			label: d.label,
			help_text: d.help_text,
			required: d.required,
			options: d.options ?? null,
			position: String(d.position),
			value_text: v?.value_text ?? null,
			value_number: v?.value_number ?? null,
			value_bool: v?.value_bool ?? null,
			value_date: v?.value_date ?? null
		};
	});
}
