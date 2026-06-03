import { randomBytes } from 'node:crypto';

// Opaque, URL-safe secret minted at domain creation and embedded in the
// deterministic inbound path /webhooks/brevo/inbound/{token}/{domain}. The
// Phase 2 handler rejects any request whose token doesn't match the row.
// 24 random bytes → 32 base64url chars. Crypto-strong; never derived from org data.
export function generateInboundWebhookToken(): string {
	return randomBytes(24).toString('base64url');
}
