import { and, desc, eq, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import { jobs, media } from '$lib/server/db/schema';
import { r2Presign } from '$lib/server/media/r2';
import type { JobSignoff } from '$lib/types/jobs';

/**
 * Load a job's client sign-off (Session 6): who signed, when, and the drawn signature image
 * with short-lived signed R2 URLs. `signed_at === null` means the customer has not signed yet.
 * The name/date live on the jobs row; the signature is a single `media` row (purpose_tag
 * job_signoff_signature, bound to the job). Operational — no cost gating.
 */
export async function loadJobSignoff(orgId: string, jobId: string): Promise<JobSignoff> {
	const [job] = await db
		.select({
			signer_name: jobs.signoff_signature_name,
			signed_at: jobs.signoff_signed_at
		})
		.from(jobs)
		.where(and(eq(jobs.id, jobId), eq(jobs.org_id, orgId)))
		.limit(1);

	const [sig] = await db
		.select({
			id: media.id,
			r2_key: media.r2_key,
			thumbnail_key: media.thumbnail_key,
			web_key: media.web_key
		})
		.from(media)
		.where(
			and(
				eq(media.job_id, jobId),
				eq(media.org_id, orgId),
				eq(media.purpose_tag, 'job_signoff_signature'),
				isNull(media.deleted_at)
			)
		)
		.orderBy(desc(media.created_at))
		.limit(1);

	const signature = sig
		? {
				id: sig.id,
				thumb_url: await r2Presign(sig.thumbnail_key ?? sig.r2_key, 3600),
				full_url: await r2Presign(sig.web_key ?? sig.r2_key, 3600)
			}
		: null;

	return {
		signer_name: job?.signer_name ?? null,
		signed_at: job?.signed_at?.toISOString() ?? null,
		signature
	};
}
