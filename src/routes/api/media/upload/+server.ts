import { json, error } from '@sveltejs/kit';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { media, jobs, quotes, invoices } from '$lib/server/db/schema';
import { and, eq, isNull } from 'drizzle-orm';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { checkUploadRateLimit } from '$lib/server/media/rateLimiter';
import { validateMagicBytes, isAllowedMimeType } from '$lib/server/media/mimeCheck';
import { processImage } from '$lib/server/media/imageProcessor';
import { r2Upload, r2DeleteObjects } from '$lib/server/media/r2';
import { sha256Buffer } from '$lib/utils/hash';
import {
	assertAndIncrementUsage,
	getCurrentUsage,
	UsageLimitExceededError,
	BYTES_PER_GB
} from '$lib/server/usage/assertAndIncrementUsage';

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB
const ORG_LOGO_MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
const ORG_LOGO_ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);

const ALLOWED_PURPOSE_TAGS = [
	'job_photo',
	'before',
	'after',
	'marketing_asset',
	'quote_attachment',
	'invoice_attachment',
	'org_logo'
] as const;
type PurposeTag = (typeof ALLOWED_PURPOSE_TAGS)[number];

const JOB_PURPOSE_TAGS: PurposeTag[] = ['job_photo', 'before', 'after', 'marketing_asset'];

const uploadSchema = z.object({
	purpose_tag: z.enum(ALLOWED_PURPOSE_TAGS),
	job_id: z.string().uuid().optional(),
	quote_id: z.string().uuid().optional(),
	invoice_id: z.string().uuid().optional()
});

export const POST: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);

	if (!auth.member.can_upload_files) {
		error(403, 'Forbidden: upload permission required');
	}

	// Rate limiting — truly atomic via Lua script
	const allowed = await checkUploadRateLimit(auth.orgId);
	if (!allowed) {
		return json({ error: 'Upload rate limit exceeded. Maximum 20 uploads per minute.' }, { status: 429 });
	}

	let formData: FormData;
	try {
		formData = await event.request.formData();
	} catch {
		return json({ error: 'Invalid multipart form data' }, { status: 400 });
	}

	const file = formData.get('file');
	if (!(file instanceof File)) {
		return json({ error: 'file is required' }, { status: 400 });
	}

	if (file.size === 0) {
		return json({ error: 'File is empty' }, { status: 400 });
	}

	const parsed = uploadSchema.safeParse({
		purpose_tag: formData.get('purpose_tag'),
		job_id: formData.get('job_id') || undefined,
		quote_id: formData.get('quote_id') || undefined,
		invoice_id: formData.get('invoice_id') || undefined
	});
	if (!parsed.success) {
		return json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 422 });
	}
	const { purpose_tag, job_id, quote_id, invoice_id } = parsed.data;

	const isOrgLogo = purpose_tag === 'org_logo';

	// Size cap: 5 MB for org_logo, 20 MB otherwise
	const sizeCap = isOrgLogo ? ORG_LOGO_MAX_FILE_SIZE : MAX_FILE_SIZE;
	if (file.size > sizeCap) {
		return json(
			{ error: isOrgLogo ? 'Logo exceeds 5 MB maximum' : 'File exceeds 20 MB maximum' },
			{ status: 400 }
		);
	}

	// Soft pre-flight storage check — saves an R2 round-trip if the org is
	// already at cap. Authoritative atomic check still runs in the DB tx
	// below (around the media-row insert).
	const storageLimitBytes = auth.limits.max_storage_gb * BYTES_PER_GB;
	const currentStorage = await getCurrentUsage(db, auth.orgId, 'storage_bytes');
	if (currentStorage + file.size > storageLimitBytes) {
		return json(
			{
				error: `Storage limit reached (${auth.limits.max_storage_gb} GB). Delete files or upgrade your plan.`
			},
			{ status: 403 }
		);
	}

	// Validate purpose_tag → parent FK requirements
	if (isOrgLogo) {
		// Org logo is org-scoped only; admin-gated and must NOT carry a parent FK.
		if (auth.member.role !== 'admin') {
			error(403, 'Forbidden: admin role required to upload org logo');
		}
		if (job_id || quote_id || invoice_id) {
			return json({ error: 'org_logo uploads must not include a parent FK' }, { status: 422 });
		}
	} else {
		if (purpose_tag === 'quote_attachment' && !quote_id) {
			return json({ error: 'quote_id is required for quote_attachment' }, { status: 422 });
		}
		if (purpose_tag === 'invoice_attachment' && !invoice_id) {
			return json({ error: 'invoice_id is required for invoice_attachment' }, { status: 422 });
		}
		if (JOB_PURPOSE_TAGS.includes(purpose_tag) && !job_id) {
			return json({ error: `job_id is required for ${purpose_tag}` }, { status: 422 });
		}
		if (!job_id && !quote_id && !invoice_id) {
			return json({ error: 'At least one of job_id, quote_id, invoice_id is required' }, { status: 422 });
		}
	}

	// Validate parent FK belongs to this org
	if (job_id) {
		const [j] = await db
			.select({ id: jobs.id })
			.from(jobs)
			.where(and(eq(jobs.id, job_id), eq(jobs.org_id, auth.orgId), isNull(jobs.deleted_at)))
			.limit(1);
		if (!j) return json({ error: 'Job not found' }, { status: 404 });
	}
	if (quote_id) {
		const [q] = await db
			.select({ id: quotes.id })
			.from(quotes)
			.where(and(eq(quotes.id, quote_id), eq(quotes.org_id, auth.orgId), isNull(quotes.deleted_at)))
			.limit(1);
		if (!q) return json({ error: 'Quote not found' }, { status: 404 });
	}
	if (invoice_id) {
		const [inv] = await db
			.select({ id: invoices.id })
			.from(invoices)
			.where(and(eq(invoices.id, invoice_id), eq(invoices.org_id, auth.orgId), isNull(invoices.deleted_at)))
			.limit(1);
		if (!inv) return json({ error: 'Invoice not found' }, { status: 404 });
	}

	// Read file bytes
	const fileBytes = Buffer.from(await file.arrayBuffer());

	// Validate MIME type vs claimed Content-Type and magic bytes
	const claimedMime = file.type || '';
	if (!isAllowedMimeType(claimedMime)) {
		return json({ error: 'File type not allowed. Accepted: images (JPEG, PNG, WebP, GIF, HEIC) and PDF.' }, { status: 422 });
	}

	if (isOrgLogo && !ORG_LOGO_ALLOWED_MIME.has(claimedMime)) {
		return json({ error: 'Logo must be a JPEG, PNG, or WebP image.' }, { status: 422 });
	}

	const detectedMime = validateMagicBytes(fileBytes, claimedMime);
	if (!detectedMime) {
		return json({ error: 'File content does not match the declared file type' }, { status: 422 });
	}

	if (isOrgLogo && !ORG_LOGO_ALLOWED_MIME.has(detectedMime)) {
		return json({ error: 'Logo must be a JPEG, PNG, or WebP image.' }, { status: 422 });
	}

	const isPdf = detectedMime === 'application/pdf';
	const isImage = !isPdf;

	// Build R2 keys
	const fileUuid = randomUUID();
	const uploadedKeys: string[] = [];

	let r2Key: string;
	let thumbnailKey: string | null = null;
	let webKey: string | null = null;
	let uploadedFileSize: number;
	let mediaType: 'photo' | 'pdf' | 'attachment';
	let storedMime: string;

	try {
		if (isPdf) {
			// PDFs: store original only
			r2Key = `${auth.orgId}/${purpose_tag}/${fileUuid}-original.pdf`;
			await r2Upload(r2Key, fileBytes, 'application/pdf');
			uploadedKeys.push(r2Key);
			uploadedFileSize = fileBytes.length;
			mediaType = 'pdf';
			storedMime = 'application/pdf';
		} else {
			// Images: Sharp processes all variants, never store raw bytes
			let variants;
			try {
				variants = await processImage(fileBytes);
			} catch (imgErr) {
				const msg = imgErr instanceof Error ? imgErr.message : 'Image processing failed';
				return json({ error: msg }, { status: 422 });
			}

			r2Key = `${auth.orgId}/${purpose_tag}/${fileUuid}-original.${variants.ext}`;
			webKey = `${auth.orgId}/${purpose_tag}/${fileUuid}-web.${variants.ext}`;
			thumbnailKey = `${auth.orgId}/${purpose_tag}/${fileUuid}-thumb.${variants.ext}`;

			// Upload all three variants to R2 (outside DB transaction per spec)
			await Promise.all([
				r2Upload(r2Key, variants.original, 'image/jpeg').then(() => uploadedKeys.push(r2Key)),
				r2Upload(webKey, variants.web, 'image/jpeg').then(() => uploadedKeys.push(webKey!)),
				r2Upload(thumbnailKey, variants.thumb, 'image/jpeg').then(() => uploadedKeys.push(thumbnailKey!))
			]);

			uploadedFileSize = variants.original.length;
			mediaType = 'photo';
			storedMime = variants.mime;
		}
	} catch (uploadErr) {
		// R2 upload failed — best-effort cleanup of anything that uploaded
		if (uploadedKeys.length > 0) {
			await r2DeleteObjects(uploadedKeys).catch(() => {});
		}
		console.error('[media/upload] R2 upload error:', uploadErr);
		return json({ error: 'File upload failed. Please try again.' }, { status: 502 });
	}

	// Insert DB row + atomically increment storage usage in the same tx.
	// If the storage limit is exceeded (race with another concurrent upload),
	// the throw rolls back the media row and we clean up R2 below.
	let inserted;
	try {
		inserted = await db.transaction(async (tx) => {
			const [row] = await tx
				.insert(media)
				.values({
					org_id: auth.orgId,
					uploaded_by: auth.member.id,
					job_id: job_id ?? null,
					quote_id: quote_id ?? null,
					invoice_id: invoice_id ?? null,
					r2_key: r2Key,
					thumbnail_key: thumbnailKey,
					web_key: webKey,
					original_filename: file.name,
					file_size_bytes: uploadedFileSize,
					media_type: mediaType,
					mime_type: storedMime,
					purpose_tag: purpose_tag,
					scan_status: 'pending',
					sha256_hash: sha256Buffer(fileBytes)
				})
				.returning();
			await assertAndIncrementUsage(tx, {
				orgId: auth.orgId,
				metric: 'storage_bytes',
				limit: storageLimitBytes,
				increment: uploadedFileSize
			});
			return row;
		});
	} catch (dbErr) {
		// Best-effort R2 cleanup on DB failure (including limit overage)
		await r2DeleteObjects(uploadedKeys).catch(() => {});
		if (dbErr instanceof UsageLimitExceededError) {
			return json(
				{
					error: `Storage limit reached (${auth.limits.max_storage_gb} GB). Delete files or upgrade your plan.`
				},
				{ status: 403 }
			);
		}
		console.error('[media/upload] DB insert error:', dbErr);
		return json({ error: 'Failed to save file record. Please try again.' }, { status: 500 });
	}

	return json({ data: inserted }, { status: 201 });
};
