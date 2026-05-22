/**
 * Sanitize free-text input from public/untrusted clients.
 *
 * - Strips all HTML tags
 * - Collapses runs of whitespace (including newlines) to single spaces
 * - Trims leading/trailing whitespace
 *
 * Returns the cleaned string. Callers enforce length bounds.
 */
export function sanitizePlainText(input: string): string {
	const noTags = input.replace(/<[^>]*>/g, '');
	const collapsed = noTags.replace(/\s+/g, ' ').trim();
	return collapsed;
}

export const CHANGE_REQUEST_MAX_LENGTH = 2000;
