import { Worker, type Job } from 'bullmq';
import { and, eq, isNull } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { db } from '$lib/server/db/client';
import { media } from '$lib/server/db/schema';
import { MEDIA_QUEUE, redisConnection } from '$lib/server/queue/bullmq';
import { r2Upload, r2DeleteObjects } from '$lib/server/media/r2';
import { validateMagicBytes, detectMimeFromBytes } from '$lib/server/media/mimeCheck';
import { processImage } from '$lib/server/media/imageProcessor';
import { sha256Buffer } from '$lib/utils/hash';
import { assertAndIncrementUsage } from '$lib/server/usage/assertAndIncrementUsage';
import { createLogger } from '$lib/server/log';

const env = process.env;
const log = createLogger('media.worker');

// Inbound media is never blocked on storage limit (we can't refuse a customer's
// photo) — but it is still counted. Use an effectively-unbounded cap.
const NO_BLOCK_LIMIT = Number.MAX_SAFE_INTEGER;

type MediaSource = 'twilio' | 'messenger';

type MediaItem = { url: string; content_type?: string };

type MediaJobData = {
	outbox_event_id: string;
	event_type: string;
	org_id: string | null;
	resource_type: string;
	resource_id: string; // message_id
	payload: {
		message_id: string;
		conversation_id: string;
		contact_id: string;
		org_id: string;
		// Which provider the URLs come from. Twilio media is private (Basic-auth
		// fetch + a trusted content-type); Messenger/FB CDN URLs are public and
		// carry no content-type, so the type is sniffed from the bytes. Absent =
		// 'twilio' for backward-compatibility with already-queued events.
		media_source?: MediaSource;
		media: MediaItem[];
	};
};

function twilioAuthHeader(): string | null {
	const sid = env.TWILIO_ACCOUNT_SID;
	const token = env.TWILIO_AUTH_TOKEN;
	if (!sid || !token) return null;
	return `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`;
}

/**
 * Download one inbound media file, validate it, store it in R2 (with resized
 * variants for photos), and insert a media row linked to the message. Idempotent
 * per file via sha256 — a retry that already stored this exact file skips it
 * instead of duplicating.
 *
 * Twilio media sits behind a private, expiring URL (Basic-auth fetch) and ships a
 * trusted content-type we cross-check. Messenger/FB CDN URLs are public (no auth
 * header) and carry no usable content-type, so the type is sniffed from the bytes.
 */
async function storeOneMedia(
	orgId: string,
	messageId: string,
	item: MediaItem,
	source: MediaSource,
	authHeader: string | null
): Promise<void> {
	const res = await fetch(
		item.url,
		source === 'twilio' && authHeader ? { headers: { Authorization: authHeader } } : {}
	);
	if (!res.ok) throw new Error(`${source} media fetch failed (${res.status})`);
	const bytes = Buffer.from(await res.arrayBuffer());
	if (bytes.length === 0) {
		log.warn({ phase: 'empty_media', message_id: messageId, url: item.url });
		return;
	}

	const sha = sha256Buffer(bytes);

	// Per-file idempotency: skip if this exact file is already stored for the message.
	const [dup] = await db
		.select({ id: media.id })
		.from(media)
		.where(and(eq(media.message_id, messageId), eq(media.sha256_hash, sha)))
		.limit(1);
	if (dup) return;

	// Twilio ships a trusted content-type we cross-check; Messenger ships none, so
	// detect purely from magic bytes. Either way only image/* + PDF are storable.
	const detectedMime =
		source === 'messenger'
			? detectMimeFromBytes(bytes)
			: validateMagicBytes(bytes, item.content_type || '');
	if (!detectedMime) {
		log.warn({
			phase: 'unsupported_media',
			message_id: messageId,
			source,
			content_type: item.content_type
		});
		return;
	}

	const isPdf = detectedMime === 'application/pdf';
	const fileUuid = randomUUID();
	const uploadedKeys: string[] = [];
	let r2Key: string;
	let thumbnailKey: string | null = null;
	let webKey: string | null = null;
	let fileSize: number;
	let mediaType: 'photo' | 'pdf';
	let storedMime: string;

	try {
		if (isPdf) {
			r2Key = `${orgId}/message_attachment/${fileUuid}-original.pdf`;
			await r2Upload(r2Key, bytes, 'application/pdf');
			uploadedKeys.push(r2Key);
			fileSize = bytes.length;
			mediaType = 'pdf';
			storedMime = 'application/pdf';
		} else {
			const variants = await processImage(bytes);
			r2Key = `${orgId}/message_attachment/${fileUuid}-original.${variants.ext}`;
			webKey = `${orgId}/message_attachment/${fileUuid}-web.${variants.ext}`;
			thumbnailKey = `${orgId}/message_attachment/${fileUuid}-thumb.${variants.ext}`;
			await Promise.all([
				r2Upload(r2Key, variants.original, 'image/jpeg').then(() => uploadedKeys.push(r2Key)),
				r2Upload(webKey, variants.web, 'image/jpeg').then(() => uploadedKeys.push(webKey!)),
				r2Upload(thumbnailKey, variants.thumb, 'image/jpeg').then(() =>
					uploadedKeys.push(thumbnailKey!)
				)
			]);
			fileSize = variants.original.length;
			mediaType = 'photo';
			storedMime = variants.mime;
		}
	} catch (err) {
		if (uploadedKeys.length > 0) await r2DeleteObjects(uploadedKeys).catch(() => {});
		throw err;
	}

	try {
		await db.transaction(async (tx) => {
			await tx.insert(media).values({
				org_id: orgId,
				uploaded_by: null,
				message_id: messageId,
				r2_key: r2Key,
				thumbnail_key: thumbnailKey,
				web_key: webKey,
				original_filename: isPdf ? 'attachment.pdf' : `photo.${storedMime.split('/')[1] ?? 'jpg'}`,
				file_size_bytes: fileSize,
				media_type: mediaType,
				mime_type: storedMime,
				purpose_tag: 'message_attachment',
				scan_status: 'pending',
				sha256_hash: sha
			});
			await assertAndIncrementUsage(tx, {
				orgId,
				metric: 'storage_bytes',
				limit: NO_BLOCK_LIMIT,
				increment: fileSize
			});
		});
	} catch (err) {
		await r2DeleteObjects(uploadedKeys).catch(() => {});
		throw err;
	}
}

async function processInboundMedia(job: Job<MediaJobData>) {
	const { payload } = job.data;
	const orgId = payload.org_id;
	const messageId = payload.message_id;
	if (!orgId || !messageId || !Array.isArray(payload.media)) {
		log.warn({ phase: 'bad_payload', message_id: messageId });
		return;
	}

	const source: MediaSource = payload.media_source === 'messenger' ? 'messenger' : 'twilio';

	// Twilio URLs are private and require Basic auth; Messenger/FB CDN URLs are
	// public, so no header is built for them.
	let authHeader: string | null = null;
	if (source === 'twilio') {
		authHeader = twilioAuthHeader();
		if (!authHeader) throw new Error('TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN are required');
	}

	for (const item of payload.media) {
		if (!item?.url) continue;
		await storeOneMedia(orgId, messageId, item, source, authHeader);
	}
}

export const mediaWorker = new Worker<MediaJobData>(
	MEDIA_QUEUE,
	async (job) => {
		if (job.name !== 'message.media.received') {
			log.warn({ phase: 'unknown_job', name: job.name });
			return;
		}
		await processInboundMedia(job);
	},
	{
		connection: redisConnection(),
		concurrency: Number(env.MEDIA_WORKER_CONCURRENCY ?? '3')
	}
);

mediaWorker.on('failed', (job, err) => {
	console.error(`[media] job ${job?.id} (${job?.name}) failed:`, err.message);
});
