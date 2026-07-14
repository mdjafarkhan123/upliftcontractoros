import sharp from 'sharp';

/**
 * Branded Before/After image generator (B2).
 *
 * Stitches one "before" photo and one "after" photo into a single shareable
 * image with the org's logo, name, and brand colour baked in — the marketing
 * payoff of tagging job photos. Runs entirely server-side (sharp), so the source
 * photos are read straight from R2 and never hit a browser canvas (which would
 * taint on cross-origin and break export).
 */

export type BeforeAfterLayout = 'side' | 'stacked';

// Each photo is normalised to a fixed square cell (cover-cropped) so mismatched
// aspect ratios still produce a clean, uniform result.
const CELL = 1000;
const DIVIDER = 6; // brand-coloured seam between the two photos
const FOOTER_H = 170; // branding band height
const LOGO_H = 96; // logo height inside the footer
const DEFAULT_BRAND = '#16794a';

function escapeXml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&apos;');
}

// Only accept a #rgb / #rrggbb hex; fall back to the default brand green so a
// malformed stored colour can never inject into the SVG.
function normalizeColor(input: string | null): string {
	if (!input) return DEFAULT_BRAND;
	const v = input.trim();
	return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v) ? v : DEFAULT_BRAND;
}

// Truncate very long org names so they don't overflow the footer band.
function clampName(name: string, max = 42): string {
	const trimmed = name.trim();
	return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed;
}

// A pill label ("BEFORE" / "AFTER") overlaid on the top-left of each photo.
function labelSvg(text: string): Buffer {
	const w = 234;
	const h = 76;
	return Buffer.from(
		`<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">` +
			`<rect rx="38" ry="38" width="${w}" height="${h}" fill="rgba(13,21,15,0.72)"/>` +
			`<text x="50%" y="50%" dominant-baseline="central" text-anchor="middle" ` +
			`font-family="Arial, Helvetica, sans-serif" font-size="38" font-weight="700" ` +
			`letter-spacing="3" fill="#ffffff">${escapeXml(text)}</text>` +
			`</svg>`
	);
}

// The branding band: solid brand-colour rectangle + org name. When a logo is
// present the name is left-aligned after it; otherwise it's centred.
function footerSvg(width: number, orgName: string, brand: string, logoWidth: number): Buffer {
	const hasLogo = logoWidth > 0;
	const textX = hasLogo ? 36 + logoWidth + 28 : Math.round(width / 2);
	const anchor = hasLogo ? 'start' : 'middle';
	return Buffer.from(
		`<svg width="${width}" height="${FOOTER_H}" xmlns="http://www.w3.org/2000/svg">` +
			`<rect width="${width}" height="${FOOTER_H}" fill="${brand}"/>` +
			`<text x="${textX}" y="${Math.round(FOOTER_H / 2)}" dominant-baseline="central" ` +
			`text-anchor="${anchor}" font-family="Arial, Helvetica, sans-serif" font-size="52" ` +
			`font-weight="700" fill="#ffffff">${escapeXml(clampName(orgName))}</text>` +
			`</svg>`
	);
}

async function fitCell(buf: Buffer): Promise<Buffer> {
	return sharp(buf, { animated: false })
		.rotate()
		.resize(CELL, CELL, { fit: 'cover', position: 'centre' })
		.toBuffer();
}

export async function composeBeforeAfter(opts: {
	before: Buffer;
	after: Buffer;
	logo: Buffer | null;
	orgName: string;
	primaryColor: string | null;
	layout: BeforeAfterLayout;
}): Promise<Buffer> {
	const brand = normalizeColor(opts.primaryColor);
	const isSide = opts.layout === 'side';

	const [beforeCell, afterCell] = await Promise.all([fitCell(opts.before), fitCell(opts.after)]);

	const contentW = isSide ? CELL * 2 + DIVIDER : CELL;
	const contentH = isSide ? CELL : CELL * 2 + DIVIDER;
	const totalW = contentW;
	const totalH = contentH + FOOTER_H;

	// Resize the logo to a fixed height (if any). Failure to decode the logo is
	// non-fatal — we just render the name without it.
	let logoBuf: Buffer | null = null;
	let logoW = 0;
	if (opts.logo) {
		try {
			logoBuf = await sharp(opts.logo, { animated: false })
				.rotate()
				.resize({ height: LOGO_H, fit: 'inside', withoutEnlargement: true })
				.png()
				.toBuffer();
			const meta = await sharp(logoBuf).metadata();
			logoW = meta.width ?? 0;
		} catch {
			logoBuf = null;
			logoW = 0;
		}
	}

	const overlays: sharp.OverlayOptions[] = [
		// Photos
		{ input: beforeCell, top: 0, left: 0 },
		{
			input: afterCell,
			top: isSide ? 0 : CELL + DIVIDER,
			left: isSide ? CELL + DIVIDER : 0
		},
		// Labels
		{ input: labelSvg('BEFORE'), top: 28, left: 28 },
		{
			input: labelSvg('AFTER'),
			top: isSide ? 28 : CELL + DIVIDER + 28,
			left: isSide ? CELL + DIVIDER + 28 : 28
		},
		// Footer band
		{ input: footerSvg(totalW, opts.orgName, brand, logoW), top: contentH, left: 0 }
	];

	if (logoBuf) {
		overlays.push({
			input: logoBuf,
			top: contentH + Math.round((FOOTER_H - LOGO_H) / 2),
			left: 36
		});
	}

	return sharp({
		create: { width: totalW, height: totalH, channels: 3, background: brand }
	})
		.composite(overlays)
		.jpeg({ quality: 88, mozjpeg: true })
		.toBuffer();
}
