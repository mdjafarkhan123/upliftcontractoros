// Brand-color theming for client-facing surfaces (public quote page + PDF).
// Pure + isomorphic — safe to import in .svelte files and in server code.
//
// A contractor's brand color is freeform (any hex). To keep the Accept button
// and accents readable, we derive a foreground (text) color from the brand's
// luminance instead of trusting white text. When no brand color is set we fall
// back to the app's primary green so the surface always looks intentional.

// App primary green (#227d53) — the default accent when an org has no brand color.
export const DEFAULT_BRAND = '#227d53';
const DARK_FG = '#0f172a'; // slate-900 — text on light brand colors
const LIGHT_FG = '#ffffff'; // text on dark brand colors

export interface BrandTheme {
	/** The accent color (validated brand color, or the default green). */
	accent: string;
	/** Readable text color to place on top of `accent`. */
	accentFg: string;
	/** Whether the org supplied a real brand color (vs. the default). */
	custom: boolean;
}

const HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

function expand(hex: string): string {
	const h = hex.replace('#', '');
	if (h.length === 3) {
		return h
			.split('')
			.map((c) => c + c)
			.join('');
	}
	return h;
}

/** Relative luminance (0–1) per the WCAG sRGB formula. */
function luminance(hex: string): number {
	const h = expand(hex);
	const channels = [0, 2, 4].map((i) => {
		const v = parseInt(h.slice(i, i + 2), 16) / 255;
		return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
	});
	return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

/** Pick black or white text for readability on the given background color. */
export function readableTextColor(hex: string): string {
	if (!HEX_RE.test(hex)) return LIGHT_FG;
	// Threshold 0.45 keeps mid-greens (the brand default) on white text.
	return luminance(hex) > 0.45 ? DARK_FG : LIGHT_FG;
}

/** Resolve an org's stored color into a complete, safe theme. */
export function resolveBrandTheme(primaryColor: string | null | undefined): BrandTheme {
	const valid = typeof primaryColor === 'string' && HEX_RE.test(primaryColor.trim());
	const accent = valid ? primaryColor!.trim().toLowerCase() : DEFAULT_BRAND;
	return {
		accent,
		accentFg: readableTextColor(accent),
		custom: valid
	};
}
