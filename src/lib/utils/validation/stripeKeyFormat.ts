const RESTRICTED_RE = /^rk_(live|test)_[A-Za-z0-9]{20,}$/;
const PUBLISHABLE_RE = /^pk_(live|test)_[A-Za-z0-9]{20,}$/;
const WEBHOOK_SECRET_RE = /^whsec_[A-Za-z0-9]{16,}$/;

export function isValidStripeRestrictedKey(value: unknown): value is string {
	return typeof value === 'string' && RESTRICTED_RE.test(value);
}

export function isValidStripePublishableKey(value: unknown): value is string {
	return typeof value === 'string' && PUBLISHABLE_RE.test(value);
}

export function isValidStripeWebhookSecret(value: unknown): value is string {
	return typeof value === 'string' && WEBHOOK_SECRET_RE.test(value);
}

export function maskSecret(value: string | null | undefined): string | null {
	if (!value) return null;
	if (value.length <= 8) return '********';
	const prefix = value.slice(0, Math.min(8, value.indexOf('_') + 1 || 8));
	const tail = value.slice(-4);
	return `${prefix}********${tail}`;
}
