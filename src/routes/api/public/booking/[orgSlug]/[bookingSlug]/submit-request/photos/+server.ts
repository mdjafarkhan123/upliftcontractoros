// Public REQUEST photo upload endpoint (R4.2). No session required.
//
// A client on the public request form can attach up to 10 photos of the work to be
// done (ref/req/4.jpg). Media rows need a request_id parent (exactly-one-parent
// CHECK), so — exactly like the authenticated New Request page — the wizard creates
// the request first, then uploads each staged photo here with that request_id.
//
// This is the ONLY unauthenticated path into the media pipeline, so it is tightly
// scoped: the request_id must belong to an ACTIVE request form on this org, be a
// genuine public-form submission through THIS booking link, be freshly created (an
// upload window measured in minutes), and be under the photo cap. IP + per-org rate
// limits and the same magic-byte / Sharp / storage-usage guards as the authenticated
// uploader all apply. uploaded_by is null (there is no member).
//
// One file per request (mirrors the authenticated MediaUploader), so each photo gets
// its own progress + retry on the client.

import { json } from '@sveltejs/kit';
import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { bookingFormFields, bookingLinks, media, organizations, requests } from '$lib/server/db/schema';
import { checkRequestPhotoIpRateLimit, extractClientIp } from '$lib/server/booking/rateLimit';
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

const NO_STORE = { 'Cache-Control': 'no-store' };

// Match the authenticated request-photo cap and general file size limit.
const REQUEST_PHOTO_CAP = 10;
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB

// How long after a request is created photos may still be attached. Generous enough
// for a slow mobile upload of 10 images, short enough that a leaked request UUID can't
// be used as free long-term storage.
const UPLOAD_WINDOW_MS = 30 * 60 * 1000;

function notFound(): Response {
	return json({ error: 'Not found' }, { status: 404, headers: NO_STORE });
}

interface RequestFormLookup {
	link_id: string;
	org_id: string;
	max_storage_gb: number;
}

// Only an ACTIVE, non-deleted REQUEST form on an active, booking-enabled org. Any miss
// → generic 404 so anonymous callers can't enumerate orgs or form types.
async function findActiveRequestLink(
	orgSlug: string,
	bookingSlug: string
): Promise<RequestFormLookup | null> {
	const [row] = await db
		.select({
			link_id: bookingLinks.id,
			org_id: bookingLinks.org_id,
			max_storage_gb: organizations.max_storage_gb
		})
		.from(bookingLinks)
		.innerJoin(organizations, eq(organizations.id, bookingLinks.org_id))
		.where(
			and(
				eq(organizations.slug, orgSlug),
				eq(organizations.status, 'active'),
				sql`${organizations.deleted_at} IS NULL`,
				eq(organizations.feature_online_booking, true),
				eq(bookingLinks.slug, bookingSlug),
				eq(bookingLinks.form_type, 'request'),
				eq(bookingLinks.is_active, true),
				sql`${bookingLinks.deleted_at} IS NULL`
			)
		)
		.limit(1);

	return row ?? null;
}

export const POST: RequestHandler = async ({ params, request }) => {
	const orgSlug = params.orgSlug!;
	const bookingSlug = params.bookingSlug!;

	// 1. IP rate limit (fail-open) — dedicated generous budget so a full 10-photo
	//    attachment isn't cut off by the 3-per-10-min submission limiter.
	const ip = extractClientIp(request);
	const ipCheck = await checkRequestPhotoIpRateLimit(ip);
	if (!ipCheck.allowed) {
		return json(
			{ error: 'Too many uploads. Please try again later.' },
			{
				status: 429,
				headers: {
					...NO_STORE,
					...(ipCheck.retryAfterSeconds ? { 'Retry-After': String(ipCheck.retryAfterSeconds) } : {})
				}
			}
		);
	}

	// 2. Resolve the request form (generic 404 hides any unavailable state / wrong type).
	const link = await findActiveRequestLink(orgSlug, bookingSlug);
	if (!link) return notFound();

	// 2b. Photos must be enabled on THIS form (R5.2). A form with the Photos field
	//     turned off never accepts uploads, even from a crafted request. Absent row
	//     ⇒ treat as enabled (defensive default, matches the public config fallback).
	const [photosField] = await db
		.select({ is_enabled: bookingFormFields.is_enabled })
		.from(bookingFormFields)
		.where(
			and(
				eq(bookingFormFields.booking_link_id, link.link_id),
				eq(bookingFormFields.standard_key, 'photos')
			)
		)
		.limit(1);
	if (photosField && !photosField.is_enabled) return notFound();

	// 3. Parse multipart body (file + request_id).
	let formData: FormData;
	try {
		formData = await request.formData();
	} catch {
		return json({ error: 'Invalid multipart form data' }, { status: 400, headers: NO_STORE });
	}

	const requestId = formData.get('request_id');
	if (typeof requestId !== 'string' || !requestId) {
		return json({ error: 'request_id is required' }, { status: 422, headers: NO_STORE });
	}

	const file = formData.get('file');
	if (!(file instanceof File)) {
		return json({ error: 'file is required' }, { status: 400, headers: NO_STORE });
	}
	if (file.size === 0) {
		return json({ error: 'File is empty' }, { status: 400, headers: NO_STORE });
	}
	if (file.size > MAX_FILE_SIZE) {
		return json({ error: 'File exceeds 20 MB maximum' }, { status: 400, headers: NO_STORE });
	}

	// 4. Validate the request_id is a fresh public-form submission through THIS link.
	//    A 404 for any mismatch — never confirm a request exists to an anonymous caller.
	const uploadCutoff = new Date(Date.now() - UPLOAD_WINDOW_MS);
	const [req] = await db
		.select({ id: requests.id })
		.from(requests)
		.where(
			and(
				eq(requests.id, requestId),
				eq(requests.org_id, link.org_id),
				eq(requests.source, 'public_form'),
				eq(requests.booking_link_id, link.link_id),
				gt(requests.created_at, uploadCutoff),
				isNull(requests.deleted_at)
			)
		)
		.limit(1);
	if (!req) return notFound();

	// 5. Per-org upload rate limit (truly atomic via Lua).
	const allowed = await checkUploadRateLimit(link.org_id);
	if (!allowed) {
		return json(
			{ error: 'Upload rate limit exceeded. Please try again shortly.' },
			{ status: 429, headers: NO_STORE }
		);
	}

	// 6. Photo cap — count live request photos before spending an R2 round-trip.
	const [{ count }] = await db
		.select({ count: sql<number>`count(*)::int` })
		.from(media)
		.where(
			and(
				eq(media.request_id, requestId),
				eq(media.purpose_tag, 'request_photo'),
				isNull(media.deleted_at)
			)
		);
	if (count >= REQUEST_PHOTO_CAP) {
		return json(
			{ error: `Up to ${REQUEST_PHOTO_CAP} photos per request.` },
			{ status: 422, headers: NO_STORE }
		);
	}

	// 7. MIME + magic-byte validation. Request photos are images only.
	const fileBytes = Buffer.from(await file.arrayBuffer());
	const claimedMime = file.type || '';
	if (!isAllowedMimeType(claimedMime)) {
		return json(
			{ error: 'File type not allowed. Accepted: JPEG, PNG, WebP, GIF, HEIC.' },
			{ status: 422, headers: NO_STORE }
		);
	}
	const detectedMime = validateMagicBytes(fileBytes, claimedMime);
	if (!detectedMime) {
		return json(
			{ error: 'File content does not match the declared file type' },
			{ status: 422, headers: NO_STORE }
		);
	}
	if (detectedMime === 'application/pdf') {
		return json(
			{ error: 'Photos must be an image (JPEG, PNG, WebP).' },
			{ status: 422, headers: NO_STORE }
		);
	}

	// 8. Soft pre-flight storage check — saves an R2 round-trip if already at cap.
	//    The authoritative atomic check runs in the DB tx below.
	const storageLimitBytes = link.max_storage_gb * BYTES_PER_GB;
	const currentStorage = await getCurrentUsage(db, link.org_id, 'storage_bytes');
	if (currentStorage + file.size > storageLimitBytes) {
		return json(
			{ error: 'This business has reached its storage limit.' },
			{ status: 403, headers: NO_STORE }
		);
	}

	// 9. Process into R2 variants (never store raw bytes).
	const fileUuid = randomUUID();
	const uploadedKeys: string[] = [];
	let r2Key: string;
	let webKey: string;
	let thumbnailKey: string;
	let uploadedFileSize: number;
	let storedMime: string;
	try {
		let variants;
		try {
			variants = await processImage(fileBytes);
		} catch (imgErr) {
			const msg = imgErr instanceof Error ? imgErr.message : 'Image processing failed';
			return json({ error: msg }, { status: 422, headers: NO_STORE });
		}

		r2Key = `${link.org_id}/request_photo/${fileUuid}-original.${variants.ext}`;
		webKey = `${link.org_id}/request_photo/${fileUuid}-web.${variants.ext}`;
		thumbnailKey = `${link.org_id}/request_photo/${fileUuid}-thumb.${variants.ext}`;

		await Promise.all([
			r2Upload(r2Key, variants.original, 'image/jpeg').then(() => uploadedKeys.push(r2Key)),
			r2Upload(webKey, variants.web, 'image/jpeg').then(() => uploadedKeys.push(webKey)),
			r2Upload(thumbnailKey, variants.thumb, 'image/jpeg').then(() =>
				uploadedKeys.push(thumbnailKey)
			)
		]);

		uploadedFileSize = variants.original.length;
		storedMime = variants.mime;
	} catch (uploadErr) {
		if (uploadedKeys.length > 0) await r2DeleteObjects(uploadedKeys).catch(() => {});
		console.error('[request photo] R2 upload error:', uploadErr);
		return json({ error: 'Upload failed. Please try again.' }, { status: 502, headers: NO_STORE });
	}

	// 10. Insert the media row + atomically increment storage usage. If the org raced
	//     over its limit the throw rolls back the row and we clean up R2.
	let inserted;
	try {
		inserted = await db.transaction(async (tx) => {
			const [row] = await tx
				.insert(media)
				.values({
					org_id: link.org_id,
					uploaded_by: null,
					request_id: requestId,
					r2_key: r2Key,
					thumbnail_key: thumbnailKey,
					web_key: webKey,
					original_filename: file.name,
					file_size_bytes: uploadedFileSize,
					media_type: 'photo',
					mime_type: storedMime,
					purpose_tag: 'request_photo',
					scan_status: 'pending',
					sha256_hash: sha256Buffer(fileBytes)
				})
				.returning({ id: media.id });
			await assertAndIncrementUsage(tx, {
				orgId: link.org_id,
				metric: 'storage_bytes',
				limit: storageLimitBytes,
				increment: uploadedFileSize
			});
			return row;
		});
	} catch (dbErr) {
		await r2DeleteObjects(uploadedKeys).catch(() => {});
		if (dbErr instanceof UsageLimitExceededError) {
			return json(
				{ error: 'This business has reached its storage limit.' },
				{ status: 403, headers: NO_STORE }
			);
		}
		console.error('[request photo] DB insert error:', dbErr);
		return json(
			{ error: 'Failed to save photo. Please try again.' },
			{ status: 500, headers: NO_STORE }
		);
	}

	return json({ data: { id: inserted.id } }, { status: 201, headers: NO_STORE });
};
