/**
 * POST /api/webhooks/brevo/inbound/{token}/{domain}
 *
 * Brevo inbound parse webhook. Brevo's payload carries NO signature, so the
 * path token IS the authentication: we look up the email_domains row by
 * (inbound_domain = {domain}) AND (inbound_webhook_token = {token}). A mismatch
 * is rejected. The matched row yields the org (canonical rule: receiving domain
 * → org); threading to a conversation happens inside the processor.
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { and, eq } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import { emailDomains } from '$lib/server/db/schema';
import { createLogger } from '$lib/server/log';
import {
	processBrevoInbound,
	type BrevoInboundPayload,
	type BrevoInboundItem
} from '$lib/server/email/brevo/inboundProcessor';

const log = createLogger('email.webhook.brevo.inbound');

function normalizePayload(parsed: unknown): BrevoInboundPayload {
	if (parsed && typeof parsed === 'object' && 'items' in parsed) {
		return parsed as BrevoInboundPayload;
	}
	if (Array.isArray(parsed)) return { items: parsed as BrevoInboundItem[] };
	if (parsed && typeof parsed === 'object') return { items: [parsed as BrevoInboundItem] };
	return { items: [] };
}

export const POST: RequestHandler = async ({ params, request }) => {
	const token = params.token;
	const domain = params.domain?.toLowerCase();
	if (!token || !domain) {
		return json({ error: 'Invalid token.' }, { status: 401 });
	}

	const [row] = await db
		.select({ org_id: emailDomains.org_id })
		.from(emailDomains)
		.where(
			and(eq(emailDomains.inbound_domain, domain), eq(emailDomains.inbound_webhook_token, token))
		)
		.limit(1);

	if (!row) {
		log.warn({ phase: 'invalid_token', domain });
		return json({ error: 'Invalid token.' }, { status: 401 });
	}

	let parsed: unknown;
	try {
		parsed = await request.json();
	} catch {
		return json({ error: 'Invalid JSON.' }, { status: 400 });
	}

	try {
		await processBrevoInbound({ orgId: row.org_id, payload: normalizePayload(parsed) });
	} catch (err) {
		log.error({
			phase: 'process_failed',
			org_id: row.org_id,
			error: err instanceof Error ? err.message : String(err)
		});
		// 500 → Brevo retries; the per-item audit row is written only on success,
		// so re-delivery short-circuits already-processed items and retries the rest.
		return json({ error: 'Failed to process inbound email.' }, { status: 500 });
	}

	return new Response(null, { status: 204 });
};
