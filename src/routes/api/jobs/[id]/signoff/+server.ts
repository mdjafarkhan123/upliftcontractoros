import { json, error } from '@sveltejs/kit';
import { and, eq, isNull } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { jobs, media, outboxEvents } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { canEditJob } from '$lib/server/jobs/permissions';
import { saveJobSignoffSchema } from '$lib/server/jobs/schemas';
import { loadJobSignoff } from '$lib/server/jobs/signoffResponse';
import { assertAndIncrementUsage, BYTES_PER_GB } from '$lib/server/usage/assertAndIncrementUsage';

// Save the client sign-off: the signer's typed name (the drawn signature image is uploaded
// separately via /api/media/upload). Stamps signed_at server-side. Allowed on ANY job status —
// the customer typically signs at completion, so this is not blocked on closed jobs. Gated on
// canEditJob: the field tech who ran the job captures the customer's approval.
export const PATCH: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);

	const id = event.params.id!;

	const [job] = await db
		.select({ id: jobs.id, assigned_to: jobs.assigned_to })
		.from(jobs)
		.where(and(eq(jobs.id, id), eq(jobs.org_id, auth.orgId), isNull(jobs.deleted_at)))
		.limit(1);
	if (!job) error(404, 'Job not found');
	if (!canEditJob(auth.member, { assigned_to: job.assigned_to })) error(403, 'Forbidden');

	let body: unknown;
	try {
		body = await event.request.json();
	} catch {
		error(400, 'Invalid JSON body');
	}

	const parsed = saveJobSignoffSchema.safeParse(body);
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

	// A drawn signature must be captured first — the name alone is not a sign-off.
	const [sig] = await db
		.select({ id: media.id })
		.from(media)
		.where(
			and(
				eq(media.job_id, id),
				eq(media.org_id, auth.orgId),
				eq(media.purpose_tag, 'job_signoff_signature'),
				isNull(media.deleted_at)
			)
		)
		.limit(1);
	if (!sig) {
		return json({ error: 'Draw a signature before saving the sign-off.' }, { status: 422 });
	}

	await db
		.update(jobs)
		.set({
			signoff_signature_name: parsed.data.signer_name,
			signoff_signed_at: new Date(),
			updated_at: new Date()
		})
		.where(and(eq(jobs.id, id), eq(jobs.org_id, auth.orgId)));

	const signoff = await loadJobSignoff(auth.orgId, id);
	return json({ data: { signoff } });
};

// Clear the sign-off: soft-delete the signature image (releasing its R2 objects + storage quota
// via the media.deleted outbox event) and null the name/date on the job. Atomic. Gated on
// canEditJob so the capturing tech can redo it, rather than the broader can_upload_files.
export const DELETE: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);

	const id = event.params.id!;

	const [job] = await db
		.select({ id: jobs.id, assigned_to: jobs.assigned_to })
		.from(jobs)
		.where(and(eq(jobs.id, id), eq(jobs.org_id, auth.orgId), isNull(jobs.deleted_at)))
		.limit(1);
	if (!job) error(404, 'Job not found');
	if (!canEditJob(auth.member, { assigned_to: job.assigned_to })) error(403, 'Forbidden');

	const sigs = await db
		.select({
			id: media.id,
			file_size_bytes: media.file_size_bytes,
			r2_key: media.r2_key,
			thumbnail_key: media.thumbnail_key,
			web_key: media.web_key
		})
		.from(media)
		.where(
			and(
				eq(media.job_id, id),
				eq(media.org_id, auth.orgId),
				eq(media.purpose_tag, 'job_signoff_signature'),
				isNull(media.deleted_at)
			)
		);

	const now = new Date();
	await db.transaction(async (tx) => {
		for (const sig of sigs) {
			await tx
				.update(media)
				.set({ deleted_at: now, updated_at: now })
				.where(and(eq(media.id, sig.id), isNull(media.deleted_at)));

			await assertAndIncrementUsage(tx, {
				orgId: auth.orgId,
				metric: 'storage_bytes',
				limit: auth.limits.max_storage_gb * BYTES_PER_GB,
				increment: -sig.file_size_bytes
			});

			await tx.insert(outboxEvents).values({
				org_id: auth.orgId,
				event_type: 'media.deleted',
				resource_type: 'media',
				resource_id: sig.id,
				payload: {
					media_id: sig.id,
					org_id: auth.orgId,
					r2_key: sig.r2_key,
					thumbnail_key: sig.thumbnail_key,
					web_key: sig.web_key
				},
				idempotency_key: `media.deleted:${sig.id}`
			});
		}

		await tx
			.update(jobs)
			.set({ signoff_signature_name: null, signoff_signed_at: null, updated_at: now })
			.where(and(eq(jobs.id, id), eq(jobs.org_id, auth.orgId)));
	});

	return new Response(null, { status: 204 });
};
