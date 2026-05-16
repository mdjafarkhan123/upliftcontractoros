/**
 * Strip all HTML tags and escape dangerous chars from inbound webchat messages.
 * No library dependency — regex-based. Messages are plain text only.
 */
export function sanitizeMessageBody(raw: string): string {
	return raw
		.replace(/<[^>]*>/g, '') // strip tags
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#x27;')
		.trim();
}
