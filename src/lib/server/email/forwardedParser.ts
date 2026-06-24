import { parseAddresses, type ParsedAddress } from './inboundCorrelation';

// Stage 3 — manual-forward recovery (Method B). When a contractor manually
// forwards a customer's email into their CRM forwarding address, the envelope
// From is the contractor, not the customer. These tools (Gmail/Outlook/Apple
// Mail) all prepend a quoted header block naming the ORIGINAL sender. We detect
// that block and recover the original `From:` so the lead is filed under the
// customer — never the contractor. Auto-forward (Method A) preserves the real
// sender via headers, so this is purely the manual-forward fallback.

// Explicit "this is a forward" banners.
const FORWARD_MARKERS: RegExp[] = [
	/-{2,}\s*forwarded message\s*-{2,}/i, // Gmail / Thunderbird
	/begin forwarded message:/i // Apple Mail
];

// Outlook (desktop) has no banner — just a quoted header block. The `Sent:`
// header is Outlook-specific and a strong signal a real forwarded block follows,
// so we require a From: line closely followed by a Sent: line to avoid treating
// an ordinary reply quote as a forward.
const OUTLOOK_BLOCK = /^[ \t>]*from:\s*.+\n(?:[ \t>]*.*\n){0,2}[ \t>]*sent:\s*.+/im;

// First `From:` line inside the forwarded region (tolerates leading `>` quoting).
const FROM_LINE = /^[ \t>]*from:\s*(.+?)\s*$/im;

/**
 * Extract the original sender from a manually-forwarded email body. Returns null
 * when the body is not a recognizable forward — the caller then falls back to the
 * envelope From. Operates on the plain-text body (HTML is stripped upstream).
 */
export function detectForwardedSender(body: string | null | undefined): ParsedAddress | null {
	if (!body) return null;
	const text = body.replace(/\r\n/g, '\n');

	// Locate the start of the forwarded section.
	let region: string | null = null;
	let markerIdx = -1;
	for (const marker of FORWARD_MARKERS) {
		const m = marker.exec(text);
		if (m && (markerIdx === -1 || m.index < markerIdx)) markerIdx = m.index;
	}
	if (markerIdx >= 0) {
		region = text.slice(markerIdx);
	} else if (OUTLOOK_BLOCK.test(text)) {
		const fm = FROM_LINE.exec(text);
		if (!fm) return null;
		region = text.slice(fm.index);
	}
	if (!region) return null;

	// Pull the first From: line in the region and parse its address.
	const fromMatch = FROM_LINE.exec(region);
	if (!fromMatch) return null;
	const [addr] = parseAddresses(fromMatch[1]);
	if (!addr || !addr.address.includes('@')) return null;
	return addr;
}
