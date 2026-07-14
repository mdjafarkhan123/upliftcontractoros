import { json, error } from '@sveltejs/kit';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { media, jobs, organizations } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import {
	assertAndIncrementUsage,
	getCurrentUsage,
	UsageLimitExceededError,
	BYTES_PER_GB
} from '$lib/server/usage/assertAndIncrementUsage';
import { r2Get, r2Upload, r2DeleteObjects } from '$lib/server/media/r2';
import { processImage } from '$lib/server/media/imageProcessor';
import { sha256Buffer } from '$lib/utils/hash';
import { composeBeforeAfter } from '$lib/server/media/beforeAfterComposite';

// Photo tags eligible for a before/after composite (the job-photo family).
const PHOTO_FAMILY = ['before', 'after', 'job_photo'] as const;

const schema = z.object({
	before_id: z.string().uuid(),
	after_id: z.string().uuid(),
	layout: z.enum(['side', 'stacked']),
	// 'preview' → return the JPEG bytes (used for the on-screen preview and Download).
	// 'message' → persist the composite as a sendable contact attachment and return its id.
	target: z.enum(['preview', 'message'])
});

// Fetch the logo bytes whether logo_url is an R2 key or an absolute URL.
async function loadLogo(logoUrl: string | null): Promise<Buffer | null> {
	if (!logoUrl) return null;
	try {
		if (/^https?:\/\//i.test(logoUrl)) {
			const res = await fetch(logoUrl);
			if (!res.ok) return null;
			return Buffer.from(await res.arrayBuffer());
		}
		return await r2Get(logoUrl);
	} catch {
		return null;
	}
}

export const POST: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);

	if (!auth.member.can_upload_files) {
		error(403, 'Forbidden: upload permission required');
	}

	let parsed: z.infer<typeof schema>;
	try {
		const result = schema.safeParse(await event.request.json());
		if (!result.success) {
			return json({ error: result.error.issues[0]?.message ?? 'Invalid input' }, { status: 422 });
		}
		parsed = result.data;
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	if (parsed.before_id === parsed.after_id) {
		return json({ error: 'Pick two different photos.' }, { status: 422 });
	}

	// Load both photos, org-scoped and not deleted.
	const rows = await db
		.select({
			id: media.id,
			job_id: media.job_id,
			r2_key: media.r2_key,
			web_key: media.web_key,
			media_type: media.media_type,
			purpose_tag: media.purpose_tag
		})
		.from(media)
		.where(
			and(
				inArray(media.id, [parsed.before_id, parsed.after_id]),
				eq(media.org_id, auth.orgId),
				isNull(media.deleted_at)
			)
		);

	const before = rows.find((r) => r.id === parsed.before_id);
	const after = rows.find((r) => r.id === parsed.after_id);
	if (!before || !after) return json({ error: 'Photo not found' }, { status: 404 });

	for (const r of [before, after]) {
		if (r.media_type !== 'photo') {
			return json({ error: 'Only photos can be combined.' }, { status: 422 });
		}
		if (!PHOTO_FAMILY.includes(r.purpose_tag as (typeof PHOTO_FAMILY)[number])) {
			return json({ error: 'Only job photos can be combined.' }, { status: 422 });
		}
	}

	// Both photos must belong to the same job — that job's customer is who we'd text.
	if (!before.job_id || before.job_id !== after.job_id) {
		return json({ error: 'Both photos must belong to the same job.' }, { status: 422 });
	}
	const jobId = before.job_id;

	// Org branding.
	const [org] = await db
		.select({
			name: organizations.name,
			logo_url: organizations.logo_url,
			primary_color: organizations.primary_color
		})
		.from(organizations)
		.where(eq(organizations.id, auth.orgId))
		.limit(1);
	if (!org) return json({ error: 'Organization not found' }, { status: 404 });

	// Read source photos (web variant when available) + logo from R2.
	let composite: Buffer;
	try {
		const [beforeBuf, afterBuf, logoBuf] = await Promise.all([
			r2Get(before.web_key ?? before.r2_key),
			r2Get(after.web_key ?? after.r2_key),
			loadLogo(org.logo_url)
		]);
		composite = await composeBeforeAfter({
			before: beforeBuf,
			after: afterBuf,
			logo: logoBuf,
			orgName: org.name,
			primaryColor: org.primary_color,
			layout: parsed.layout
		});
	} catch (e) {
		console.error('[before-after-export] compose error:', e);
		return json({ error: 'Could not build the image. Please try again.' }, { status: 500 });
	}

	// ── Preview / Download: return the bytes, persist nothing ─────────────────
	if (parsed.target === 'preview') {
		return new Response(new Uint8Array(composite), {
			status: 200,
			headers: {
				'content-type': 'image/jpeg',
				'cache-control': 'no-store'
			}
		});
	}

	// ── Message: persist the composite as a contact attachment ────────────────
	// It's created against the job's customer (contact_id) and left unlinked
	// (message_id NULL) so the standard message-send route can re-parent it onto
	// the outgoing MMS — exactly like a composer-uploaded attachment.
	const [job] = await db
		.select({ contact_id: jobs.contact_id })
		.from(jobs)
		.where(and(eq(jobs.id, jobId), eq(jobs.org_id, auth.orgId), isNull(jobs.deleted_at)))
		.limit(1);
	if (!job) return json({ error: 'Job not found' }, { status: 404 });

	// Re-encode through the standard variant pipeline (original/web/thumb).
	let variants;
	try {
		variants = await processImage(composite);
	} catch (e) {
		console.error('[before-after-export] processImage error:', e);
		return json({ error: 'Could not build the image. Please try again.' }, { status: 500 });
	}

	const storageLimitBytes = auth.limits.max_storage_gb * BYTES_PER_GB;
	const currentStorage = await getCurrentUsage(db, auth.orgId, 'storage_bytes');
	if (currentStorage + variants.original.length > storageLimitBytes) {
		return json(
			{
				error: `Storage limit reached (${auth.limits.max_storage_gb} GB). Delete files or upgrade your plan.`
			},
			{ status: 403 }
		);
	}

	const fileUuid = randomUUID();
	const r2Key = `${auth.orgId}/contact_attachment/${fileUuid}-original.${variants.ext}`;
	const webKey = `${auth.orgId}/contact_attachment/${fileUuid}-web.${variants.ext}`;
	const thumbnailKey = `${auth.orgId}/contact_attachment/${fileUuid}-thumb.${variants.ext}`;
	const uploadedKeys: string[] = [];

	try {
		await Promise.all([
			r2Upload(r2Key, variants.original, 'image/jpeg').then(() => uploadedKeys.push(r2Key)),
			r2Upload(webKey, variants.web, 'image/jpeg').then(() => uploadedKeys.push(webKey)),
			r2Upload(thumbnailKey, variants.thumb, 'image/jpeg').then(() =>
				uploadedKeys.push(thumbnailKey)
			)
		]);
	} catch (e) {
		if (uploadedKeys.length > 0) await r2DeleteObjects(uploadedKeys).catch(() => {});
		console.error('[before-after-export] R2 upload error:', e);
		return json({ error: 'Upload failed. Please try again.' }, { status: 502 });
	}

	let inserted;
	try {
		inserted = await db.transaction(async (tx) => {
			const [row] = await tx
				.insert(media)
				.values({
					org_id: auth.orgId,
					uploaded_by: auth.member.id,
					contact_id: job.contact_id,
					r2_key: r2Key,
					thumbnail_key: thumbnailKey,
					web_key: webKey,
					original_filename: 'before-after.jpg',
					file_size_bytes: variants.original.length,
					media_type: 'photo',
					mime_type: variants.mime,
					purpose_tag: 'contact_attachment',
					scan_status: 'pending',
					sha256_hash: sha256Buffer(variants.original)
				})
				.returning({ id: media.id });
			await assertAndIncrementUsage(tx, {
				orgId: auth.orgId,
				metric: 'storage_bytes',
				limit: storageLimitBytes,
				increment: variants.original.length
			});
			return row;
		});
	} catch (e) {
		await r2DeleteObjects(uploadedKeys).catch(() => {});
		if (e instanceof UsageLimitExceededError) {
			return json(
				{
					error: `Storage limit reached (${auth.limits.max_storage_gb} GB). Delete files or upgrade your plan.`
				},
				{ status: 403 }
			);
		}
		console.error('[before-after-export] DB insert error:', e);
		return json({ error: 'Failed to save the image. Please try again.' }, { status: 500 });
	}

	return json({ data: { media_id: inserted.id, contact_id: job.contact_id } }, { status: 201 });
};
