import { json, error } from '@sveltejs/kit';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { jobs, jobCustomFields, jobCustomFieldValues } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { canEditJob } from '$lib/server/jobs/permissions';
import { saveJobCustomFieldValuesSchema } from '$lib/server/jobs/schemas';
import { loadJobCustomFields } from '$lib/server/jobs/customFieldsResponse';
import { resolveCustomFieldColumns, isCustomFieldFilled } from '$lib/server/jobs/customFieldValues';
import type { JobCustomFieldType } from '$lib/types/jobs';

// PATCH /api/jobs/[id]/custom-fields — save this job's custom-field values in one call. The UI
// sends the full set of values shown on the job. Required fields (Jobber-style) must be filled
// or the save is rejected with per-field errors and nothing is written. Values upsert by
// (job_id, field_id); a cleared field deletes its value row.
export const PATCH: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);

	const jobId = event.params.id!;

	const [job] = await db
		.select({ id: jobs.id, assigned_to: jobs.assigned_to })
		.from(jobs)
		.where(and(eq(jobs.id, jobId), eq(jobs.org_id, auth.orgId), isNull(jobs.deleted_at)))
		.limit(1);
	if (!job) error(404, 'Job not found');
	if (!canEditJob(auth.member, { assigned_to: job.assigned_to })) error(403, 'Forbidden');

	let body: unknown;
	try {
		body = await event.request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	const parsed = saveJobCustomFieldValuesSchema.safeParse(body);
	if (!parsed.success) {
		return json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 422 });
	}

	// Live definitions are the source of truth for field types + which are required.
	const defs = await db
		.select({
			id: jobCustomFields.id,
			field_type: jobCustomFields.field_type,
			required: jobCustomFields.required
		})
		.from(jobCustomFields)
		.where(and(eq(jobCustomFields.org_id, auth.orgId), isNull(jobCustomFields.deleted_at)));
	const defById = new Map(defs.map((d) => [d.id, d]));

	// Resolve each incoming answer to its typed columns, keyed by field id. Values for unknown /
	// deleted fields are ignored.
	const incoming = new Map<string, ReturnType<typeof resolveCustomFieldColumns>>();
	for (const v of parsed.data.values) {
		const def = defById.get(v.field_id);
		if (!def) continue;
		incoming.set(v.field_id, resolveCustomFieldColumns(def.field_type as JobCustomFieldType, v));
	}

	// Required gate: for every required field, the effective value (incoming if sent, else the
	// stored one) must be filled. Load stored values only for required fields not in the payload.
	const missingRequired: string[] = [];
	if (defs.some((d) => d.required)) {
		const storedByField = new Map<string, ReturnType<typeof resolveCustomFieldColumns>>();
		const needStoredIds = defs.filter((d) => d.required && !incoming.has(d.id)).map((d) => d.id);
		if (needStoredIds.length > 0) {
			const stored = await db
				.select({
					field_id: jobCustomFieldValues.field_id,
					value_text: jobCustomFieldValues.value_text,
					value_number: jobCustomFieldValues.value_number,
					value_bool: jobCustomFieldValues.value_bool,
					value_date: jobCustomFieldValues.value_date
				})
				.from(jobCustomFieldValues)
				.where(
					and(
						eq(jobCustomFieldValues.job_id, jobId),
						eq(jobCustomFieldValues.org_id, auth.orgId),
						inArray(jobCustomFieldValues.field_id, needStoredIds)
					)
				);
			for (const s of stored) {
				storedByField.set(s.field_id, {
					value_text: s.value_text,
					value_number: s.value_number,
					value_bool: s.value_bool,
					value_date: s.value_date
				});
			}
		}

		for (const d of defs) {
			if (!d.required) continue;
			const cols = incoming.get(d.id) ??
				storedByField.get(d.id) ?? {
					value_text: null,
					value_number: null,
					value_bool: null,
					value_date: null
				};
			if (!isCustomFieldFilled(d.field_type as JobCustomFieldType, cols))
				missingRequired.push(d.id);
		}
	}

	if (missingRequired.length > 0) {
		const field_errors: Record<string, string> = {};
		for (const id of missingRequired) field_errors[id] = 'Required';
		return json({ error: 'Please fill the required fields', field_errors }, { status: 422 });
	}

	if (incoming.size > 0) {
		const now = new Date();
		await db.transaction(async (tx) => {
			for (const [fieldId, cols] of incoming) {
				const allNull =
					cols.value_text === null &&
					cols.value_number === null &&
					cols.value_bool === null &&
					cols.value_date === null;
				if (allNull) {
					// Cleared → drop the value row entirely.
					await tx
						.delete(jobCustomFieldValues)
						.where(
							and(
								eq(jobCustomFieldValues.job_id, jobId),
								eq(jobCustomFieldValues.field_id, fieldId),
								eq(jobCustomFieldValues.org_id, auth.orgId)
							)
						);
					continue;
				}
				await tx
					.insert(jobCustomFieldValues)
					.values({ org_id: auth.orgId, job_id: jobId, field_id: fieldId, ...cols })
					.onConflictDoUpdate({
						target: [jobCustomFieldValues.job_id, jobCustomFieldValues.field_id],
						set: { ...cols, updated_at: now }
					});
			}
		});
	}

	const custom_fields = await loadJobCustomFields(auth.orgId, jobId);
	return json({ data: { custom_fields } });
};
