import { createHash } from 'node:crypto';
import { r2Upload } from '$lib/server/media/r2';
import { isAllowedMimeType, detectMimeFromBytes } from '$lib/server/media/mimeCheck';
import { downloadInboundAttachment } from './brevo/webhooks';

const MAX_TOTAL_BYTES = 20 * 1024 * 1024;
const MAX_PER_FILE_BYTES = 15 * 1024 * 1024;

export type RawInboundAttachment = {
	filename?: string | null;
	content_type?: string | null;
	contentType?: string | null;
	/** base64 inline content (when a provider sends it inline). */
	content?: string | null;
	/** Pre-signed download URL (when a provider links large attachments). */
	url?: string | null;
	/** Brevo DownloadToken — fetched via the authenticated inbound endpoint. */
	downloadToken?: string | null;
	size?: number | null;
};

export type PreparedAttachment = {
	r2Key: string;
	originalFilename: string;
	mimeType: string;
	mediaType: 'photo' | 'pdf' | 'attachment';
	fileSizeBytes: number;
	sha256: string;
};

function sanitizeFilename(name: string | null | undefined): string {
	const fallback = 'attachment';
	if (!name) return fallback;
	const cleaned = name
		.replace(/[\\/]+/g, '_')
		.replace(/[^\w\-. ]/g, '')
		.trim();
	return cleaned.length ? cleaned.slice(0, 200) : fallback;
}

function deriveMediaType(mime: string): 'photo' | 'pdf' | 'attachment' {
	if (mime.startsWith('image/')) return 'photo';
	if (mime === 'application/pdf') return 'pdf';
	return 'attachment';
}

async function downloadUrl(url: string): Promise<Buffer> {
	const res = await fetch(url);
	if (!res.ok) throw new Error(`Attachment download failed: ${res.status}`);
	const ab = await res.arrayBuffer();
	return Buffer.from(ab);
}

/**
 * Validate, dedupe, and push inbound email attachments to R2. Returns prepared
 * rows ready to insert into `media` after the message is created.
 *
 * Drops (does not throw on) attachments that fail the MIME allowlist or magic-
 * byte check — we log the skip in the caller and proceed with the rest.
 */
export async function prepareInboundAttachments(input: {
	orgId: string;
	conversationId: string;
	attachments: RawInboundAttachment[];
}): Promise<{ prepared: PreparedAttachment[]; skipped: { filename: string; reason: string }[] }> {
	const prepared: PreparedAttachment[] = [];
	const skipped: { filename: string; reason: string }[] = [];
	let totalBytes = 0;

	for (const att of input.attachments) {
		const filename = sanitizeFilename(att.filename);
		let buf: Buffer;

		try {
			if (att.content) {
				buf = Buffer.from(att.content, 'base64');
			} else if (att.downloadToken) {
				buf = await downloadInboundAttachment(att.downloadToken);
			} else if (att.url) {
				buf = await downloadUrl(att.url);
			} else {
				skipped.push({ filename, reason: 'no content, token, or url' });
				continue;
			}
		} catch (err) {
			skipped.push({
				filename,
				reason: err instanceof Error ? err.message : 'fetch failed'
			});
			continue;
		}

		if (buf.length === 0) {
			skipped.push({ filename, reason: 'empty content' });
			continue;
		}
		if (buf.length > MAX_PER_FILE_BYTES) {
			skipped.push({ filename, reason: `exceeds per-file limit (${buf.length} bytes)` });
			continue;
		}
		if (totalBytes + buf.length > MAX_TOTAL_BYTES) {
			skipped.push({ filename, reason: 'total size limit reached' });
			continue;
		}

		const claimed = (att.content_type ?? att.contentType ?? '').toLowerCase().trim();
		const detected = detectMimeFromBytes(buf);
		const mime = detected ?? (isAllowedMimeType(claimed) ? claimed : null);
		if (!mime) {
			skipped.push({
				filename,
				reason: `disallowed or unrecognized type (${claimed || 'unknown'})`
			});
			continue;
		}

		const sha256 = createHash('sha256').update(buf).digest('hex');
		const r2Key = `orgs/${input.orgId}/conversations/${input.conversationId}/inbound/${sha256}/${filename}`;

		await r2Upload(r2Key, buf, mime);

		totalBytes += buf.length;
		prepared.push({
			r2Key,
			originalFilename: filename,
			mimeType: mime,
			mediaType: deriveMediaType(mime),
			fileSizeBytes: buf.length,
			sha256
		});
	}

	return { prepared, skipped };
}
