import { json, error } from '@sveltejs/kit';
import { and, asc, eq, isNull } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import {
	jobs,
	jobFormTemplates,
	jobFormFields,
	jobFormSubmissions,
	jobFormSubmissionFields
} from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { canEditJob } from '$lib/server/jobs/permissions';
import { attachJobFormSchema } from '$lib/server/jobs/schemas';
import { loadJobFormSubmissions } from '$lib/server/jobs/formSubmissionResponse';

// Attach a form template to a job. The template's CURRENT fields are snapshot-copied into the
// submission so the filled form is independent of the template (Jobber/Housecall Pro behavior —
// editing the template later never changes forms already on a job). Gate mirrors tasks/time
// entries: edit access to the job (attaching the checklist the crew needs is core job work).
// Allowed on any status — you may fill a form on a scheduled, in-progress, or even completed job.
export const POST: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);

	const id = event.params.id!;

	let body: unknown;
	try {
		body = await event.request.json();
	} catch {
		error(400, 'Invalid JSON body');
	}

	const parsed = attachJobFormSchema.safeParse(body);
	if (!parsed.success) {
		const field_errors: Record<string, string> = {};
		for (const issue of parsed.error.issues) {
			const p = issue.path.join('.');
			if (p && !field_errors[p]) field_errors[p] = issue.message;
		}
		return json(
			{ error: parsed.error.issues[0]?.message ?? 'Invalid input', field_errors },
			{ status: 422 }
		);
	}
	const input = parsed.data;

	const [job] = await db
		.select({ id: jobs.id, assigned_to: jobs.assigned_to })
		.from(jobs)
		.where(and(eq(jobs.id, id), eq(jobs.org_id, auth.orgId), isNull(jobs.deleted_at)))
		.limit(1);
	if (!job) error(404, 'Job not found');
	if (!canEditJob(auth.member, { assigned_to: job.assigned_to })) error(403, 'Forbidden');

	// The template must be live and belong to this org.
	const [tpl] = await db
		.select({ id: jobFormTemplates.id, name: jobFormTemplates.name })
		.from(jobFormTemplates)
		.where(
			and(
				eq(jobFormTemplates.id, input.template_id),
				eq(jobFormTemplates.org_id, auth.orgId),
				isNull(jobFormTemplates.deleted_at)
			)
		)
		.limit(1);
	if (!tpl) return json({ error: 'Form template not found.' }, { status: 404 });

	const templateFields = await db
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
				eq(jobFormFields.template_id, input.template_id),
				eq(jobFormFields.org_id, auth.orgId),
				isNull(jobFormFields.deleted_at)
			)
		)
		.orderBy(asc(jobFormFields.position));

	if (templateFields.length === 0) {
		return json({ error: 'This form has no fields to fill.' }, { status: 422 });
	}

	await db.transaction(async (tx) => {
		const [submission] = await tx
			.insert(jobFormSubmissions)
			.values({
				org_id: auth.orgId,
				job_id: id,
				template_id: tpl.id,
				template_name: tpl.name,
				created_by: auth.member.id
			})
			.returning({ id: jobFormSubmissions.id });

		await tx.insert(jobFormSubmissionFields).values(
			templateFields.map((f) => ({
				org_id: auth.orgId,
				submission_id: submission.id,
				source_field_id: f.id,
				field_type: f.field_type,
				label: f.label,
				help_text: f.help_text,
				required: f.required,
				options: f.options ?? null,
				position: f.position
			}))
		);
	});

	const form_submissions = await loadJobFormSubmissions(auth.orgId, id);
	return json({ data: { form_submissions } }, { status: 201 });
};
