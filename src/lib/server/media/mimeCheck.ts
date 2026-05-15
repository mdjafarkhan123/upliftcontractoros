export const ALLOWED_MIME_TYPES = [
	'image/jpeg',
	'image/png',
	'image/webp',
	'image/gif',
	'image/heic',
	'image/heif',
	'application/pdf'
] as const;

export type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];

export function isAllowedMimeType(mime: string): mime is AllowedMimeType {
	return (ALLOWED_MIME_TYPES as readonly string[]).includes(mime);
}

type Signature = {
	bytes: number[];
	offset?: number;
	/** Additional check at a fixed offset */
	trailer?: { bytes: number[]; offset: number };
};

const SIGNATURES: Record<AllowedMimeType, Signature[]> = {
	'image/jpeg': [{ bytes: [0xff, 0xd8, 0xff] }],
	'image/png': [{ bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] }],
	'image/gif': [
		{ bytes: [0x47, 0x49, 0x46, 0x38, 0x37, 0x61] },
		{ bytes: [0x47, 0x49, 0x46, 0x38, 0x39, 0x61] }
	],
	'image/webp': [
		{
			bytes: [0x52, 0x49, 0x46, 0x46],
			trailer: { bytes: [0x57, 0x45, 0x42, 0x50], offset: 8 }
		}
	],
	'image/heic': [{ bytes: [0x66, 0x74, 0x79, 0x70], offset: 4 }],
	'image/heif': [{ bytes: [0x66, 0x74, 0x79, 0x70], offset: 4 }],
	'application/pdf': [{ bytes: [0x25, 0x50, 0x44, 0x46] }]
};

function matchesSig(buf: Buffer, sig: Signature): boolean {
	const off = sig.offset ?? 0;
	if (buf.length < off + sig.bytes.length) return false;
	for (let i = 0; i < sig.bytes.length; i++) {
		if (buf[off + i] !== sig.bytes[i]) return false;
	}
	if (sig.trailer) {
		const t = sig.trailer;
		if (buf.length < t.offset + t.bytes.length) return false;
		for (let i = 0; i < t.bytes.length; i++) {
			if (buf[t.offset + i] !== t.bytes[i]) return false;
		}
	}
	return true;
}

/**
 * Verify that the first bytes of `buf` match the expected magic bytes for `claimedMime`.
 * Returns the detected mime type if valid, null if mismatch.
 */
export function validateMagicBytes(buf: Buffer, claimedMime: string): AllowedMimeType | null {
	if (!isAllowedMimeType(claimedMime)) return null;
	const sigs = SIGNATURES[claimedMime];
	for (const sig of sigs) {
		if (matchesSig(buf, sig)) return claimedMime;
	}
	return null;
}

/** Detect MIME type from magic bytes alone (ignoring claimed type). */
export function detectMimeFromBytes(buf: Buffer): AllowedMimeType | null {
	for (const [mime, sigs] of Object.entries(SIGNATURES) as [AllowedMimeType, Signature[]][]) {
		for (const sig of sigs) {
			if (matchesSig(buf, sig)) return mime;
		}
	}
	return null;
}
