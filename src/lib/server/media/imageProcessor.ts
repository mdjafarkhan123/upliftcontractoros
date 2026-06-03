import sharp from 'sharp';

const MAX_DIMENSION_PX = 12_000;
const MAX_PIXELS = 100_000_000;
const WEB_SIZE = 1200;
const THUMB_SIZE = 300;

export type ImageVariants = {
	original: Buffer;
	web: Buffer;
	thumb: Buffer;
	/** File extension without dot (e.g. 'jpg', 'png', 'webp', 'gif') */
	ext: string;
	/** Content-Type for R2 (e.g. 'image/jpeg', 'image/png') */
	mime: string;
};

type ReEncodeFormat = 'jpeg' | 'png' | 'webp' | 'gif';

type OutputSpec = { reEncode: ReEncodeFormat; ext: string; mime: string };

/**
 * Maps Sharp's detected format string to the output format we re-encode to.
 * HEIC/HEIF → JPEG (they carry no transparency; JPEG is universally supported).
 * Every other format maps to itself to preserve transparency and avoid unnecessary conversion.
 */
const FORMAT_MAP: Record<string, OutputSpec> = {
	jpeg: { reEncode: 'jpeg', ext: 'jpg', mime: 'image/jpeg' },
	png: { reEncode: 'png', ext: 'png', mime: 'image/png' },
	webp: { reEncode: 'webp', ext: 'webp', mime: 'image/webp' },
	gif: { reEncode: 'gif', ext: 'gif', mime: 'image/gif' },
	heif: { reEncode: 'jpeg', ext: 'jpg', mime: 'image/jpeg' } // covers both HEIC and HEIF
};

function applyEncode(pipeline: ReturnType<typeof sharp>, fmt: ReEncodeFormat) {
	switch (fmt) {
		case 'jpeg':
			return pipeline.jpeg({ quality: 85, mozjpeg: true });
		case 'png':
			return pipeline.png({ compressionLevel: 8 });
		case 'webp':
			return pipeline.webp({ quality: 85 });
		case 'gif':
			return pipeline.gif();
	}
}

/**
 * Process an image buffer through Sharp:
 * 1. Read metadata to detect format and reject decompression bombs
 * 2. animated: false ensures only the first frame is processed (GIFs)
 * 3. .rotate() auto-orients from EXIF before EXIF is stripped
 * 4. Re-encode in the same format (JPEG→JPEG, PNG→PNG, WebP→WebP, GIF→GIF first frame)
 *    Exception: HEIC/HEIF → JPEG (no transparency, universal support)
 * 5. NOT calling .withMetadata() strips all EXIF/metadata (Sharp default)
 * 6. Generate three variants: original, web (≤1200px), thumb (300×300 cover)
 */
export async function processImage(input: Buffer): Promise<ImageVariants> {
	// Step 1: read header only — no full decode, safe against decompression bombs
	const meta = await sharp(input, { animated: false }).metadata();

	const w = meta.width ?? 0;
	const h = meta.height ?? 0;
	if (w > MAX_DIMENSION_PX || h > MAX_DIMENSION_PX) {
		throw new Error(
			`Image dimensions ${w}×${h} exceed the maximum allowed ${MAX_DIMENSION_PX}px per side`
		);
	}
	if (w * h > MAX_PIXELS) {
		throw new Error(
			`Image pixel count (${w * h}) exceeds the maximum of ${MAX_PIXELS.toLocaleString()}`
		);
	}

	const detectedFormat = meta.format ?? '';
	const spec = FORMAT_MAP[detectedFormat];
	if (!spec) {
		throw new Error(`Unsupported image format detected: "${detectedFormat}"`);
	}

	// Step 2-4: animated:false = first frame only; .rotate() = auto-orient from EXIF
	// Omitting .withMetadata() = strip all EXIF/metadata (Sharp default behaviour)
	const base = sharp(input, { animated: false }).rotate();

	const [original, web, thumb] = await Promise.all([
		applyEncode(base.clone(), spec.reEncode).toBuffer(),

		applyEncode(
			base.clone().resize(WEB_SIZE, WEB_SIZE, { fit: 'inside', withoutEnlargement: true }),
			spec.reEncode
		).toBuffer(),

		applyEncode(
			base.clone().resize(THUMB_SIZE, THUMB_SIZE, { fit: 'cover' }),
			spec.reEncode
		).toBuffer()
	]);

	return { original, web, thumb, ext: spec.ext, mime: spec.mime };
}
