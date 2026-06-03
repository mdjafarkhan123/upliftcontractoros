// Shared Brevo REST helper. Lazy api-key read + a thin fetch wrapper used by the
// domain client, the transactional send path, and the webhook helpers.
const env = process.env;
const BREVO_BASE = 'https://api.brevo.com/v3';

// Error thrown by brevoFetch on a non-2xx response. Carries Brevo's HTTP status
// and machine `code` (e.g. "duplicate_parameter") so callers can branch on the
// reason instead of string-matching the message. Extends Error, so existing
// `instanceof Error` / `err.message` handling keeps working.
export class BrevoError extends Error {
	status: number;
	code: string | null;
	constructor(message: string, status: number, code: string | null) {
		super(message);
		this.name = 'BrevoError';
		this.status = status;
		this.code = code;
	}
}

export function brevoApiKey(): string {
	const key = env.BREVO_API_KEY;
	if (!key) throw new Error('BREVO_API_KEY is required.');
	return key;
}

export async function brevoFetch<T>(
	path: string,
	init: { method: 'GET' | 'POST' | 'PUT' | 'DELETE'; body?: unknown }
): Promise<T> {
	const res = await fetch(`${BREVO_BASE}${path}`, {
		method: init.method,
		headers: {
			'api-key': brevoApiKey(),
			accept: 'application/json',
			...(init.body !== undefined ? { 'content-type': 'application/json' } : {})
		},
		body: init.body !== undefined ? JSON.stringify(init.body) : undefined
	});

	// PUT authenticate / DELETE / some calls return empty bodies on success.
	const text = await res.text();
	const data = text ? (JSON.parse(text) as unknown) : null;

	if (!res.ok) {
		const body = data as { message?: string; code?: string } | null;
		const message = body?.message ?? `Brevo request failed (${res.status}).`;
		throw new BrevoError(message, res.status, body?.code ?? null);
	}
	return data as T;
}

// Raw binary fetch — inbound attachment download returns application/octet-stream.
export async function brevoFetchBinary(path: string): Promise<Buffer> {
	const res = await fetch(`${BREVO_BASE}${path}`, {
		method: 'GET',
		headers: { 'api-key': brevoApiKey() }
	});
	if (!res.ok) {
		throw new Error(`Brevo binary request failed (${res.status}).`);
	}
	const ab = await res.arrayBuffer();
	return Buffer.from(ab);
}
