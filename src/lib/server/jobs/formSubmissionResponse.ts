import { alias } from 'drizzle-orm/pg-core';
import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import {
	jobFormSubmissions,
	jobFormSubmissionFields,
	orgMembers,
	media
} from '$lib/server/db/schema';
import { r2Presign } from '$lib/server/media/r2';
import type { JobFormSubmissionRow, JobFormFieldType, JobFormFieldMedia } from '$lib/types/jobs';

/**
 * Re-read a job's attached form submissions (with their snapshotted fields + answers) after a
 * mutation, mirroring loadJobTasks. Ordered by attach time so newest forms sit at the bottom;
 * fields ordered by their frozen position. Purely operational — no cost gating.
 */
export async function loadJobFormSubmissions(
	orgId: string,
	jobId: string
): Promise<JobFormSubmissionRow[]> {
	const submitter = alias(orgMembers, 'form_submitter');
	const creator = alias(orgMembers, 'form_creator');

	// Submissions and their fields are both keyed by job_id (the fields query inner-joins
	// submissions but doesn't need the submissions RESULT), so fire both in one wave instead
	// of stacking two round trips. The empty-submissions early-return moves below the wave.
	const [submissions, fields] = await Promise.all([
		db
			.select({
				id: jobFormSubmissions.id,
				template_id: jobFormSubmissions.template_id,
				template_name: jobFormSubmissions.template_name,
				status: jobFormSubmissions.status,
				submitted_at: jobFormSubmissions.submitted_at,
				submitted_by_name: submitter.full_name,
				created_by_name: creator.full_name,
				created_at: jobFormSubmissions.created_at,
				updated_at: jobFormSubmissions.updated_at
			})
			.from(jobFormSubmissions)
			.leftJoin(submitter, eq(submitter.id, jobFormSubmissions.submitted_by))
			.leftJoin(creator, eq(creator.id, jobFormSubmissions.created_by))
			.where(
				and(
					eq(jobFormSubmissions.job_id, jobId),
					eq(jobFormSubmissions.org_id, orgId),
					isNull(jobFormSubmissions.deleted_at)
				)
			)
			.orderBy(asc(jobFormSubmissions.created_at)),
		// One flat read of every field across this job's submissions, then group in memory —
		// avoids an N+1 per form. Ordered by submission then field position for stable grouping.
		db
			.select({
				id: jobFormSubmissionFields.id,
				submission_id: jobFormSubmissionFields.submission_id,
				field_type: jobFormSubmissionFields.field_type,
				label: jobFormSubmissionFields.label,
				help_text: jobFormSubmissionFields.help_text,
				required: jobFormSubmissionFields.required,
				options: jobFormSubmissionFields.options,
				position: jobFormSubmissionFields.position,
				value_text: jobFormSubmissionFields.value_text,
				value_number: jobFormSubmissionFields.value_number,
				value_bool: jobFormSubmissionFields.value_bool,
				value_date: jobFormSubmissionFields.value_date
			})
			.from(jobFormSubmissionFields)
			.innerJoin(
				jobFormSubmissions,
				eq(jobFormSubmissions.id, jobFormSubmissionFields.submission_id)
			)
			.where(
				and(
					eq(jobFormSubmissions.job_id, jobId),
					eq(jobFormSubmissionFields.org_id, orgId),
					isNull(jobFormSubmissions.deleted_at)
				)
			)
			.orderBy(asc(jobFormSubmissionFields.submission_id), asc(jobFormSubmissionFields.position))
	]);

	if (submissions.length === 0) return [];

	const fieldsBySubmission = new Map<string, JobFormSubmissionRow['fields']>();
	// Flat index by field id so we can hang each field's attached media onto it after presigning.
	const fieldById = new Map<string, JobFormSubmissionRow['fields'][number]>();
	for (const f of fields) {
		let arr = fieldsBySubmission.get(f.submission_id);
		if (!arr) {
			arr = [];
			fieldsBySubmission.set(f.submission_id, arr);
		}
		const row = {
			id: f.id,
			field_type: f.field_type as JobFormFieldType,
			label: f.label,
			help_text: f.help_text,
			required: f.required,
			options: f.options ?? null,
			position: Number(f.position),
			value_text: f.value_text,
			value_number: f.value_number,
			value_bool: f.value_bool,
			value_date: f.value_date,
			media: [] as JobFormFieldMedia[]
		};
		arr.push(row);
		fieldById.set(f.id, row);
	}

	// Attach photos/signatures for photo/signature fields. One read of this job's form media, then
	// presign each variant and route it to its owning field by line_key (= submission-field id).
	const photoFieldIds = fields
		.filter((f) => f.field_type === 'photo' || f.field_type === 'signature')
		.map((f) => f.id);
	if (photoFieldIds.length > 0) {
		const mediaRows = await db
			.select({
				id: media.id,
				line_key: media.line_key,
				purpose_tag: media.purpose_tag,
				r2_key: media.r2_key,
				thumbnail_key: media.thumbnail_key,
				web_key: media.web_key
			})
			.from(media)
			.where(
				and(
					eq(media.job_id, jobId),
					eq(media.org_id, orgId),
					inArray(media.purpose_tag, ['job_form_photo', 'job_form_signature']),
					inArray(media.line_key, photoFieldIds),
					isNull(media.deleted_at)
				)
			)
			.orderBy(asc(media.created_at));

		await Promise.all(
			mediaRows.map(async (m) => {
				const field = m.line_key ? fieldById.get(m.line_key) : undefined;
				if (!field) return;
				field.media.push({
					id: m.id,
					purpose_tag: m.purpose_tag as JobFormFieldMedia['purpose_tag'],
					thumb_url: await r2Presign(m.thumbnail_key ?? m.r2_key, 3600),
					full_url: await r2Presign(m.web_key ?? m.r2_key, 3600)
				});
			})
		);
	}

	return submissions.map((s) => ({
		id: s.id,
		template_id: s.template_id,
		template_name: s.template_name,
		status: s.status,
		submitted_at: s.submitted_at ? s.submitted_at.toISOString() : null,
		submitted_by_name: s.submitted_by_name,
		created_by_name: s.created_by_name,
		created_at: s.created_at.toISOString(),
		updated_at: s.updated_at.toISOString(),
		fields: fieldsBySubmission.get(s.id) ?? []
	}));
}
