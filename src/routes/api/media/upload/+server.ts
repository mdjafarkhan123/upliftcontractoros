import { json, error } from '@sveltejs/kit';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import {
	media,
	jobs,
	quotes,
	invoices,
	contacts,
	opportunities,
	jobFormSubmissions,
	jobFormSubmissionFields,
	appointments
} from '$lib/server/db/schema';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { canViewOpportunity } from '$lib/server/pipeline/permissions';
import { canEditJob } from '$lib/server/jobs/permissions';
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
// Org logo and contact avatar are small square brand/profile images — same caps.
const IMAGE_ASSET_MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
const IMAGE_ASSET_ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);

const ALLOWED_PURPOSE_TAGS = [
	'job_photo',
	'before',
	'after',
	'marketing_asset',
	'quote_attachment',
	'invoice_attachment',
	'contact_attachment',
	'opportunity_attachment',
	'org_logo',
	'contact_avatar',
	'org_signature',
	'quote_line_item_photo',
	'catalog_item_photo',
	'job_form_photo',
	'job_form_signature',
	'job_visit_photo',
	'job_signoff_signature',
	'quote_signature'
] as const;
type PurposeTag = (typeof ALLOWED_PURPOSE_TAGS)[number];

const JOB_PURPOSE_TAGS: PurposeTag[] = ['job_photo', 'before', 'after', 'marketing_asset'];

// Max photos a single quote line item can carry (matches the client-side cap).
const LINE_ITEM_PHOTO_CAP = 6;
// Max photos a single job-form photo field can carry. A signature field holds exactly one.
const JOB_FORM_PHOTO_CAP = 6;
// Max photos a single job visit can carry. Crews shoot before/after sets per visit, so this
// is generous relative to a form field.
const JOB_VISIT_PHOTO_CAP = 20;

const uploadSchema = z.object({
	purpose_tag: z.enum(ALLOWED_PURPOSE_TAGS),
	contact_id: z.string().uuid().optional(),
	opportunity_id: z.string().uuid().optional(),
	job_id: z.string().uuid().optional(),
	quote_id: z.string().uuid().optional(),
	invoice_id: z.string().uuid().optional(),
	// Binds a quote_line_item_photo to a specific quote line by its stable line_key.
	line_key: z.string().uuid().optional()
});

export const POST: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);

	// Rate limiting — truly atomic via Lua script
	const allowed = await checkUploadRateLimit(auth.orgId);
	if (!allowed) {
		return json(
			{ error: 'Upload rate limit exceeded. Maximum 20 uploads per minute.' },
			{ status: 429 }
		);
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
		contact_id: formData.get('contact_id') || undefined,
		opportunity_id: formData.get('opportunity_id') || undefined,
		job_id: formData.get('job_id') || undefined,
		quote_id: formData.get('quote_id') || undefined,
		invoice_id: formData.get('invoice_id') || undefined,
		line_key: formData.get('line_key') || undefined
	});
	if (!parsed.success) {
		return json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 422 });
	}
	const { purpose_tag, contact_id, opportunity_id, job_id, quote_id, invoice_id, line_key } =
		parsed.data;
	const isLineItemPhoto = purpose_tag === 'quote_line_item_photo';
	// Photo or captured signature bound to a job-form submission field (job_id + line_key=field id).
	const isJobFormMedia = purpose_tag === 'job_form_photo' || purpose_tag === 'job_form_signature';
	// Photo bound to a single job visit (job_id + line_key = the visit's appointment id).
	const isJobVisitPhoto = purpose_tag === 'job_visit_photo';
	// The customer's drawn sign-off signature bound to a job (job_id, no line_key — one per job).
	const isJobSignoff = purpose_tag === 'job_signoff_signature';
	// The customer's drawn signature captured in person when approving a quote (quote_id, no
	// line_key — one per quote). "Close in the field" / sign-on-this-device.
	const isQuoteSignature = purpose_tag === 'quote_signature';

	const isOrgLogo = purpose_tag === 'org_logo';
	const isOrgSignature = purpose_tag === 'org_signature';
	// Org-scoped brand assets stored on the organizations row (logo_url / signature_image_url):
	// admin-only, no parent FK, image-only.
	const isOrgAsset = isOrgLogo || isOrgSignature;
	const isContactAvatar = purpose_tag === 'contact_avatar';
	const isCatalogItemPhoto = purpose_tag === 'catalog_item_photo';
	// All are small image-only brand/profile assets (5 MB image cap).
	const isImageAsset = isOrgAsset || isContactAvatar || isCatalogItemPhoto;

	// Permission gates differ by purpose: org logo/signature are admin-only, contact
	// avatar rides on contact-edit rights, everything else needs the generic upload gate.
	if (isOrgAsset) {
		if (auth.member.role !== 'admin') {
			error(403, 'Forbidden: admin role required to upload org branding');
		}
	} else if (isCatalogItemPhoto) {
		if (!auth.member.can_edit_quotes) {
			error(403, 'Forbidden: quote edit permission required to upload catalog images');
		}
	} else if (isQuoteSignature) {
		// Capturing an in-person acceptance is a quote-editing action.
		if (!auth.member.can_edit_quotes) {
			error(403, 'Forbidden: quote edit permission required to capture a signature');
		}
	} else if (isContactAvatar) {
		if (!auth.member.can_edit_contacts) {
			error(403, 'Forbidden: contact edit permission required');
		}
	} else if (isJobFormMedia || isJobVisitPhoto || isJobSignoff) {
		// Gated on job-edit access (same as filling the form / completing the visit / capturing
		// the client sign-off), not can_upload_files — a field tech doing these needs to attach
		// the image. The job-scoped canEditJob check runs after the parent job loads below.
	} else if (!auth.member.can_upload_files) {
		error(403, 'Forbidden: upload permission required');
	}

	// Size cap: 5 MB for image assets (logo/avatar), 20 MB otherwise
	const sizeCap = isImageAsset ? IMAGE_ASSET_MAX_FILE_SIZE : MAX_FILE_SIZE;
	if (file.size > sizeCap) {
		return json(
			{ error: isImageAsset ? 'Image exceeds 5 MB maximum' : 'File exceeds 20 MB maximum' },
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
	if (isOrgAsset || isCatalogItemPhoto) {
		// Org logo/signature and catalog item photos are org-scoped — r2_key stored on the
		// owning row. The media row must NOT carry a parent FK (DB CHECK enforces).
		if (contact_id || opportunity_id || job_id || quote_id || invoice_id) {
			return json(
				{ error: `${purpose_tag} uploads must not include a parent FK` },
				{ status: 422 }
			);
		}
	} else {
		if (purpose_tag === 'opportunity_attachment') {
			if (!opportunity_id) {
				return json(
					{ error: 'opportunity_id is required for opportunity_attachment' },
					{ status: 422 }
				);
			}
			if (contact_id || job_id || quote_id || invoice_id) {
				return json(
					{ error: 'opportunity_attachment must not include another parent FK' },
					{ status: 422 }
				);
			}
		}
		if (purpose_tag === 'contact_attachment' || isContactAvatar) {
			// Both attach to a single contact. The avatar's r2_key is mirrored onto
			// contacts.avatar_url; the media row carries contact_id so it satisfies the
			// exactly-one-parent CHECK (it's hidden from the Files tab by purpose_tag).
			if (!contact_id) {
				return json({ error: `contact_id is required for ${purpose_tag}` }, { status: 422 });
			}
			if (job_id || quote_id || invoice_id) {
				return json(
					{ error: `${purpose_tag} must not include another parent FK` },
					{ status: 422 }
				);
			}
		}
		if (purpose_tag === 'quote_attachment' && !quote_id) {
			return json({ error: 'quote_id is required for quote_attachment' }, { status: 422 });
		}
		if (isLineItemPhoto) {
			// Photo bound to a specific quote line: parent is the quote, line_key pins the line.
			if (!quote_id) {
				return json({ error: 'quote_id is required for quote_line_item_photo' }, { status: 422 });
			}
			if (!line_key) {
				return json({ error: 'line_key is required for quote_line_item_photo' }, { status: 422 });
			}
			if (contact_id || opportunity_id || job_id || invoice_id) {
				return json(
					{ error: 'quote_line_item_photo must not include another parent FK' },
					{ status: 422 }
				);
			}
		}
		if (isJobFormMedia) {
			// Bound to a job's form field: parent is the job, line_key pins the submission field.
			if (!job_id) {
				return json({ error: `job_id is required for ${purpose_tag}` }, { status: 422 });
			}
			if (!line_key) {
				return json({ error: `line_key is required for ${purpose_tag}` }, { status: 422 });
			}
			if (contact_id || opportunity_id || quote_id || invoice_id) {
				return json(
					{ error: `${purpose_tag} must not include another parent FK` },
					{ status: 422 }
				);
			}
		}
		if (isJobVisitPhoto) {
			// Bound to a job's visit: parent is the job, line_key pins the visit (appointment).
			if (!job_id) {
				return json({ error: 'job_id is required for job_visit_photo' }, { status: 422 });
			}
			if (!line_key) {
				return json({ error: 'line_key is required for job_visit_photo' }, { status: 422 });
			}
			if (contact_id || opportunity_id || quote_id || invoice_id) {
				return json(
					{ error: 'job_visit_photo must not include another parent FK' },
					{ status: 422 }
				);
			}
		}
		if (isJobSignoff) {
			// Bound to a job (one per job): parent is the job, no line_key.
			if (!job_id) {
				return json({ error: 'job_id is required for job_signoff_signature' }, { status: 422 });
			}
			if (line_key) {
				return json(
					{ error: 'job_signoff_signature must not include a line_key' },
					{ status: 422 }
				);
			}
			if (contact_id || opportunity_id || quote_id || invoice_id) {
				return json(
					{ error: 'job_signoff_signature must not include another parent FK' },
					{ status: 422 }
				);
			}
		}
		if (isQuoteSignature) {
			// Bound to a quote (one per quote): parent is the quote, no line_key.
			if (!quote_id) {
				return json({ error: 'quote_id is required for quote_signature' }, { status: 422 });
			}
			if (line_key) {
				return json({ error: 'quote_signature must not include a line_key' }, { status: 422 });
			}
			if (contact_id || opportunity_id || job_id || invoice_id) {
				return json(
					{ error: 'quote_signature must not include another parent FK' },
					{ status: 422 }
				);
			}
		}
		if (purpose_tag === 'invoice_attachment' && !invoice_id) {
			return json({ error: 'invoice_id is required for invoice_attachment' }, { status: 422 });
		}
		if (JOB_PURPOSE_TAGS.includes(purpose_tag) && !job_id) {
			return json({ error: `job_id is required for ${purpose_tag}` }, { status: 422 });
		}
		if (!contact_id && !opportunity_id && !job_id && !quote_id && !invoice_id) {
			return json(
				{
					error:
						'At least one of contact_id, opportunity_id, job_id, quote_id, invoice_id is required'
				},
				{ status: 422 }
			);
		}
	}

	// Validate parent FK belongs to this org
	if (contact_id) {
		const [c] = await db
			.select({ id: contacts.id, assigned_to: contacts.assigned_to })
			.from(contacts)
			.where(
				and(
					eq(contacts.id, contact_id),
					eq(contacts.org_id, auth.orgId),
					isNull(contacts.deleted_at)
				)
			)
			.limit(1);
		// 404 (not 403) when the member can't see this contact — don't leak existence.
		if (!c) return json({ error: 'Contact not found' }, { status: 404 });
		if (!auth.member.can_view_all_contacts && c.assigned_to !== auth.member.id) {
			return json({ error: 'Contact not found' }, { status: 404 });
		}
	}
	if (opportunity_id) {
		const [o] = await db
			.select({ id: opportunities.id, assigned_to: opportunities.assigned_to })
			.from(opportunities)
			.where(
				and(
					eq(opportunities.id, opportunity_id),
					eq(opportunities.org_id, auth.orgId),
					isNull(opportunities.deleted_at)
				)
			)
			.limit(1);
		// 404 (not 403) when the member can't see this deal — don't leak existence.
		if (!o) return json({ error: 'Opportunity not found' }, { status: 404 });
		if (!canViewOpportunity(auth.member, o)) {
			return json({ error: 'Opportunity not found' }, { status: 404 });
		}
	}
	if (job_id) {
		const [j] = await db
			.select({ id: jobs.id, assigned_to: jobs.assigned_to })
			.from(jobs)
			.where(and(eq(jobs.id, job_id), eq(jobs.org_id, auth.orgId), isNull(jobs.deleted_at)))
			.limit(1);
		if (!j) return json({ error: 'Job not found' }, { status: 404 });

		// Job-form media gates on edit access to this specific job (same as filling the form),
		// then the line_key must resolve to a matching field on one of this job's forms.
		if (isJobFormMedia && line_key) {
			if (!canEditJob(auth.member, { assigned_to: j.assigned_to })) {
				error(403, 'Forbidden');
			}

			const [field] = await db
				.select({ field_type: jobFormSubmissionFields.field_type })
				.from(jobFormSubmissionFields)
				.innerJoin(
					jobFormSubmissions,
					eq(jobFormSubmissions.id, jobFormSubmissionFields.submission_id)
				)
				.where(
					and(
						eq(jobFormSubmissionFields.id, line_key),
						eq(jobFormSubmissionFields.org_id, auth.orgId),
						eq(jobFormSubmissions.job_id, job_id),
						isNull(jobFormSubmissions.deleted_at)
					)
				)
				.limit(1);
			if (!field) return json({ error: 'Form field not found on this job' }, { status: 404 });

			const expectedType = purpose_tag === 'job_form_photo' ? 'photo' : 'signature';
			if (field.field_type !== expectedType) {
				return json({ error: `This field does not accept a ${expectedType}.` }, { status: 422 });
			}

			// Cap before spending an R2 round-trip: 6 photos, or exactly 1 signature per field.
			const cap = purpose_tag === 'job_form_signature' ? 1 : JOB_FORM_PHOTO_CAP;
			const [{ count }] = await db
				.select({ count: sql<number>`count(*)::int` })
				.from(media)
				.where(
					and(
						eq(media.job_id, job_id),
						eq(media.line_key, line_key),
						eq(media.purpose_tag, purpose_tag),
						isNull(media.deleted_at)
					)
				);
			if (count >= cap) {
				return json(
					{
						error:
							cap === 1
								? 'A signature is already captured. Clear it before drawing a new one.'
								: `Up to ${JOB_FORM_PHOTO_CAP} photos per field.`
					},
					{ status: 422 }
				);
			}
		}

		// Visit photo gates on edit access to this job, then line_key must resolve to a live
		// visit (appointment) on this job before we cap and store it.
		if (isJobVisitPhoto && line_key) {
			if (!canEditJob(auth.member, { assigned_to: j.assigned_to })) {
				error(403, 'Forbidden');
			}

			const [visit] = await db
				.select({ id: appointments.id })
				.from(appointments)
				.where(
					and(
						eq(appointments.id, line_key),
						eq(appointments.org_id, auth.orgId),
						eq(appointments.job_id, job_id),
						isNull(appointments.deleted_at)
					)
				)
				.limit(1);
			if (!visit) return json({ error: 'Visit not found on this job' }, { status: 404 });

			// Cap before spending an R2 round-trip.
			const [{ count }] = await db
				.select({ count: sql<number>`count(*)::int` })
				.from(media)
				.where(
					and(
						eq(media.job_id, job_id),
						eq(media.line_key, line_key),
						eq(media.purpose_tag, 'job_visit_photo'),
						isNull(media.deleted_at)
					)
				);
			if (count >= JOB_VISIT_PHOTO_CAP) {
				return json(
					{ error: `Up to ${JOB_VISIT_PHOTO_CAP} photos per visit.` },
					{ status: 422 }
				);
			}
		}

		// Sign-off signature gates on edit access to this job, then caps at exactly one per job
		// (redo = clear the old one first, via DELETE /api/jobs/[id]/signoff).
		if (isJobSignoff) {
			if (!canEditJob(auth.member, { assigned_to: j.assigned_to })) {
				error(403, 'Forbidden');
			}

			const [{ count }] = await db
				.select({ count: sql<number>`count(*)::int` })
				.from(media)
				.where(
					and(
						eq(media.job_id, job_id),
						eq(media.purpose_tag, 'job_signoff_signature'),
						isNull(media.deleted_at)
					)
				);
			if (count >= 1) {
				return json(
					{ error: 'A sign-off is already captured. Clear it before drawing a new one.' },
					{ status: 422 }
				);
			}
		}
	}
	if (quote_id) {
		const [q] = await db
			.select({ id: quotes.id })
			.from(quotes)
			.where(and(eq(quotes.id, quote_id), eq(quotes.org_id, auth.orgId), isNull(quotes.deleted_at)))
			.limit(1);
		if (!q) return json({ error: 'Quote not found' }, { status: 404 });

		// One signature per quote — redo means clearing the pad client-side before submitting,
		// so a second upload for the same quote is a duplicate. Cap before the R2 round-trip.
		if (isQuoteSignature) {
			const [{ count }] = await db
				.select({ count: sql<number>`count(*)::int` })
				.from(media)
				.where(
					and(
						eq(media.quote_id, quote_id),
						eq(media.purpose_tag, 'quote_signature'),
						isNull(media.deleted_at)
					)
				);
			if (count >= 1) {
				return json(
					{ error: 'A signature is already captured for this quote.' },
					{ status: 422 }
				);
			}
		}

		// Enforce the per-line photo cap before spending an R2 round-trip.
		if (isLineItemPhoto && line_key) {
			const [{ count }] = await db
				.select({ count: sql<number>`count(*)::int` })
				.from(media)
				.where(
					and(
						eq(media.quote_id, quote_id),
						eq(media.line_key, line_key),
						eq(media.purpose_tag, 'quote_line_item_photo'),
						isNull(media.deleted_at)
					)
				);
			if (count >= LINE_ITEM_PHOTO_CAP) {
				return json(
					{ error: `Up to ${LINE_ITEM_PHOTO_CAP} photos per line item.` },
					{ status: 422 }
				);
			}
		}
	}
	if (invoice_id) {
		const [inv] = await db
			.select({ id: invoices.id })
			.from(invoices)
			.where(
				and(
					eq(invoices.id, invoice_id),
					eq(invoices.org_id, auth.orgId),
					isNull(invoices.deleted_at)
				)
			)
			.limit(1);
		if (!inv) return json({ error: 'Invoice not found' }, { status: 404 });
	}

	// Read file bytes
	const fileBytes = Buffer.from(await file.arrayBuffer());

	// Validate MIME type vs claimed Content-Type and magic bytes
	const claimedMime = file.type || '';
	if (!isAllowedMimeType(claimedMime)) {
		return json(
			{ error: 'File type not allowed. Accepted: images (JPEG, PNG, WebP, GIF, HEIC) and PDF.' },
			{ status: 422 }
		);
	}

	if (isImageAsset && !IMAGE_ASSET_ALLOWED_MIME.has(claimedMime)) {
		return json({ error: 'Image must be a JPEG, PNG, or WebP.' }, { status: 422 });
	}

	const detectedMime = validateMagicBytes(fileBytes, claimedMime);
	if (!detectedMime) {
		return json({ error: 'File content does not match the declared file type' }, { status: 422 });
	}

	if (isImageAsset && !IMAGE_ASSET_ALLOWED_MIME.has(detectedMime)) {
		return json({ error: 'Image must be a JPEG, PNG, or WebP.' }, { status: 422 });
	}

	const isPdf = detectedMime === 'application/pdf';
	const isImage = !isPdf;

	// Line item photos are images only — a PDF makes no sense as an inline line thumbnail.
	if (isLineItemPhoto && !isImage) {
		return json({ error: 'Line item photos must be an image (JPEG, PNG, WebP).' }, { status: 422 });
	}

	// Job-form photos and captured signatures are images only.
	if (isJobFormMedia && !isImage) {
		return json({ error: 'Form attachments must be an image (JPEG, PNG, WebP).' }, { status: 422 });
	}

	// Visit photos are images only.
	if (isJobVisitPhoto && !isImage) {
		return json({ error: 'Visit photos must be an image (JPEG, PNG, WebP).' }, { status: 422 });
	}

	// Sign-off signatures are images only (a PNG from the signature pad).
	if (isJobSignoff && !isImage) {
		return json({ error: 'A signature must be an image (PNG).' }, { status: 422 });
	}

	// Quote in-person signatures are images only (a PNG from the signature pad).
	if (isQuoteSignature && !isImage) {
		return json({ error: 'A signature must be an image (PNG).' }, { status: 422 });
	}

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
				r2Upload(thumbnailKey, variants.thumb, 'image/jpeg').then(() =>
					uploadedKeys.push(thumbnailKey!)
				)
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
					contact_id: contact_id ?? null,
					opportunity_id: opportunity_id ?? null,
					job_id: job_id ?? null,
					quote_id: quote_id ?? null,
					invoice_id: invoice_id ?? null,
					line_key: line_key ?? null,
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
