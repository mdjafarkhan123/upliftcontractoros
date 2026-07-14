import { json, error } from '@sveltejs/kit';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { jobs, jobFormSubmissions, jobFormSubmissionFields, media } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { canEditJob } from '$lib/server/jobs/permissions';
import { saveJobFormSubmissionSchema } from '$lib/server/jobs/schemas';
import { loadJobFormSubmissions } from '$lib/server/jobs/formSubmissionResponse';

// Load the submission + its parent job's assigned_to for the edit gate. Returns null when the
// submission doesn't exist, is soft-deleted, belongs to another org, or isn't on this job.
async function loadSubmissionForEdit(orgId: string, jobId: string, submissionId: string) {
	const [row] = await db
		.select({
			id: jobFormSubmissions.id,
			status: jobFormSubmissions.status,
			job_assigned_to: jobs.assigned_to
		})
		.from(jobFormSubmissions)
		.innerJoin(jobs, eq(jobs.id, jobFormSubmissions.job_id))
		.where(
			and(
				eq(jobFormSubmissions.id, submissionId),
				eq(jobFormSubmissions.job_id, jobId),
				eq(jobFormSubmissions.org_id, orgId),
				isNull(jobFormSubmissions.deleted_at),
				isNull(jobs.deleted_at)
			)
		)
		.limit(1);
	return row ?? null;
}

// Save answers and/or move the form's status. Same edit-access gate as attaching a form; allowed
// on any job status. Only the answer column matching each field's type is written — a value sent
// for a section/photo/signature field (which carry no scalar answer in this session) is ignored.
export const PATCH: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);

	const jobId = event.params.id!;
	const submissionId = event.params.submissionId!;

	let body: unknown;
	try {
		body = await event.request.json();
	} catch {
		error(400, 'Invalid JSON body');
	}

	const parsed = saveJobFormSubmissionSchema.safeParse(body);
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

	const found = await loadSubmissionForEdit(auth.orgId, jobId, submissionId);
	if (!found) error(404, 'Form not found');
	if (!canEditJob(auth.member, { assigned_to: found.job_assigned_to })) error(403, 'Forbidden');

	// The submission's snapshotted fields — the authority on which field ids are valid, what type
	// each is (so an answer lands in the right column), and whether it's required (for the
	// complete gate). Foreign/unknown ids are ignored.
	const fields = await db
		.select({
			id: jobFormSubmissionFields.id,
			field_type: jobFormSubmissionFields.field_type,
			label: jobFormSubmissionFields.label,
			required: jobFormSubmissionFields.required,
			value_text: jobFormSubmissionFields.value_text,
			value_number: jobFormSubmissionFields.value_number,
			value_bool: jobFormSubmissionFields.value_bool,
			value_date: jobFormSubmissionFields.value_date
		})
		.from(jobFormSubmissionFields)
		.where(
			and(
				eq(jobFormSubmissionFields.submission_id, submissionId),
				eq(jobFormSubmissionFields.org_id, auth.orgId)
			)
		);
	const typeById = new Map(fields.map((f) => [f.id, f.field_type]));

	// Required-field gate (Jobber behavior): every required field must be answered before a form
	// can be marked completed. Blocks the FORM only — not the job status. Validated up front so a
	// failed gate writes nothing. Uses the incoming answers merged over the stored values, and the
	// media table for photo/signature fields (their files upload separately, ahead of completion).
	if (input.status === 'completed' && found.status !== 'completed') {
		const answerById = new Map((input.answers ?? []).map((a) => [a.field_id, a]));

		// One count read for the required photo/signature fields on this submission.
		const requiredMediaFieldIds = fields
			.filter((f) => f.required && (f.field_type === 'photo' || f.field_type === 'signature'))
			.map((f) => f.id);
		const mediaCountByField = new Map<string, number>();
		if (requiredMediaFieldIds.length > 0) {
			const counts = await db
				.select({ line_key: media.line_key, count: sql<number>`count(*)::int` })
				.from(media)
				.where(
					and(
						eq(media.job_id, jobId),
						eq(media.org_id, auth.orgId),
						inArray(media.line_key, requiredMediaFieldIds),
						inArray(media.purpose_tag, ['job_form_photo', 'job_form_signature']),
						isNull(media.deleted_at)
					)
				)
				.groupBy(media.line_key);
			for (const c of counts) if (c.line_key) mediaCountByField.set(c.line_key, c.count);
		}

		const missing: string[] = [];
		const field_errors: Record<string, string> = {};
		for (const f of fields) {
			if (!f.required || f.field_type === 'section') continue;
			let answered: boolean;
			if (f.field_type === 'photo' || f.field_type === 'signature') {
				answered = (mediaCountByField.get(f.id) ?? 0) > 0;
			} else {
				const a = answerById.get(f.id);
				// Effective value = the incoming answer for this field, else what's stored.
				const text = a ? (a.value_text ?? null) : f.value_text;
				const num = a ? (a.value_number ?? null) : f.value_number;
				const bool = a ? (a.value_bool ?? null) : f.value_bool;
				const date = a ? (a.value_date ?? null) : f.value_date;
				switch (f.field_type) {
					case 'checkbox':
						// A required confirmation checkbox must be ticked.
						answered = bool === true;
						break;
					case 'number':
						answered = num !== null && num !== undefined && String(num).trim() !== '';
						break;
					case 'date':
						answered = !!date;
						break;
					default: // short_text / long_text / dropdown
						answered = !!(text && text.trim());
				}
			}
			if (!answered) {
				missing.push(f.label);
				field_errors[f.id] = 'Required';
			}
		}

		if (missing.length > 0) {
			return json(
				{
					error: `Complete the required field${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}`,
					field_errors
				},
				{ status: 422 }
			);
		}
	}

	const now = new Date();

	await db.transaction(async (tx) => {
		if (input.answers && input.answers.length > 0) {
			for (const a of input.answers) {
				const type = typeById.get(a.field_id);
				if (!type) continue; // not a field of this submission — ignore
				const set: Record<string, unknown> = { updated_at: now };
				switch (type) {
					case 'short_text':
					case 'long_text':
					case 'dropdown':
						set.value_text = a.value_text?.trim() || null;
						break;
					case 'number':
						set.value_number = a.value_number == null ? null : String(a.value_number);
						break;
					case 'checkbox':
						set.value_bool = a.value_bool ?? null;
						break;
					case 'date':
						set.value_date = a.value_date ?? null;
						break;
					default:
						// section / photo / signature carry no scalar answer here — skip.
						continue;
				}
				await tx
					.update(jobFormSubmissionFields)
					.set(set)
					.where(
						and(
							eq(jobFormSubmissionFields.id, a.field_id),
							eq(jobFormSubmissionFields.org_id, auth.orgId)
						)
					);
			}
		}

		if (input.status !== undefined && input.status !== found.status) {
			const set: Record<string, unknown> = { status: input.status, updated_at: now };
			// Stamp who/when on completion; clear both when reopened for more edits.
			set.submitted_at = input.status === 'completed' ? now : null;
			set.submitted_by = input.status === 'completed' ? auth.member.id : null;
			await tx
				.update(jobFormSubmissions)
				.set(set)
				.where(
					and(eq(jobFormSubmissions.id, submissionId), eq(jobFormSubmissions.org_id, auth.orgId))
				);
		} else if (input.answers && input.answers.length > 0) {
			// Touch the parent so its updated_at tracks the latest answer edit.
			await tx
				.update(jobFormSubmissions)
				.set({ updated_at: now })
				.where(
					and(eq(jobFormSubmissions.id, submissionId), eq(jobFormSubmissions.org_id, auth.orgId))
				);
		}
	});

	const form_submissions = await loadJobFormSubmissions(auth.orgId, jobId);
	return json({ data: { form_submissions } });
};

// Remove an attached form from a job (soft-delete, recoverable — matches the task/expense model).
export const DELETE: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);

	const jobId = event.params.id!;
	const submissionId = event.params.submissionId!;

	const found = await loadSubmissionForEdit(auth.orgId, jobId, submissionId);
	if (!found) error(404, 'Form not found');
	if (!canEditJob(auth.member, { assigned_to: found.job_assigned_to })) error(403, 'Forbidden');

	const now = new Date();
	await db
		.update(jobFormSubmissions)
		.set({ deleted_at: now, updated_at: now })
		.where(and(eq(jobFormSubmissions.id, submissionId), eq(jobFormSubmissions.org_id, auth.orgId)));

	const form_submissions = await loadJobFormSubmissions(auth.orgId, jobId);
	return json({ data: { form_submissions } });
};
