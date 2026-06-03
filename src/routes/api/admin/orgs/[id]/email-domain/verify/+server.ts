/**
 * POST /api/admin/orgs/[id]/email-domain/verify
 *
 * Jafar admin only (hooks.server.ts guards /api/admin/*). Drives the PO's
 * "Verify" button: triggers a Brevo auth check, reads the current status, and
 * persists it. Manual check — there is no background job in Phase 1.
 */
import { error, json } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { emailDomains } from '$lib/server/db/schema';
import {
	authenticateBrevoDomain,
	getBrevoDomain,
	ensureBrevoDomain,
	buildDnsRecords
} from '$lib/server/email/brevo/client';
import { ensureInboundWebhook, ensureTransactionalWebhook } from '$lib/server/email/brevo/webhooks';
import { annotateInboundMxStatus } from '$lib/server/email/inboundMx';
import { createLogger } from '$lib/server/log';

const log = createLogger('email.brevo.verify');
const env = process.env;

const paramsSchema = z.object({ id: z.string().uuid() });

export const POST: RequestHandler = async ({ params, url }) => {
	const parsed = paramsSchema.safeParse(params);
	if (!parsed.success) throw error(400, 'Invalid organization ID.');

	const [row] = await db
		.select()
		.from(emailDomains)
		.where(eq(emailDomains.org_id, parsed.data.id))
		.limit(1);
	if (!row) throw error(404, 'No email domain set up for this organization.');

	// External calls OUTSIDE any transaction (CLAUDE.md rule 8).
	let result;
	let receiving;
	try {
		// Trigger an auth check, but tolerate its failure: Brevo's authenticate
		// endpoint errors while DNS is missing/propagating, which is a normal
		// "still pending" state — not a reason to abort. We always fall through
		// to GET so the latest records (incl. DKIM) are fetched and persisted.
		try {
			await authenticateBrevoDomain(row.domain);
		} catch {
			// ignore — status is read authoritatively from getBrevoDomain below
		}
		result = await getBrevoDomain(row.domain);
		// Receiving domain: register it if a pre-existing org never had it, then
		// trigger its authenticate check too. Brevo only attaches an inbound parse
		// webhook to an *authenticated* receiving domain (brevo-code + DKIM + DMARC),
		// so we must kick the check just like the sending domain.
		await ensureBrevoDomain(row.inbound_domain);
		try {
			await authenticateBrevoDomain(row.inbound_domain);
		} catch {
			// ignore — receiving records may still be propagating; status read below
		}
		receiving = await getBrevoDomain(row.inbound_domain);
	} catch (e) {
		const message = e instanceof Error ? e.message : 'Could not check the domain with Brevo.';
		return json({ error: message }, { status: 502 });
	}

	// Build the combined sending + receiving records, then resolve the receiving
	// subdomain's MX live and stamp the inbound_mx rows so the persisted snapshot
	// reflects whether replies can actually be received (Brevo never reports MX).
	let dnsRecords = buildDnsRecords(row.domain, row.inbound_domain, result.raw, receiving.raw);
	dnsRecords = await annotateInboundMxStatus(dnsRecords, row.inbound_domain);

	const isReady = result.verified && result.authenticated;
	const now = new Date();
	const [updated] = await db
		.update(emailDomains)
		.set({
			brevo_verified: result.verified,
			brevo_authenticated: result.authenticated,
			status: isReady ? 'verified' : 'verifying',
			dns_records: dnsRecords,
			last_checked_at: now,
			// Stamp verified_at the first time it goes ready; never clear it.
			...(isReady && !row.verified_at ? { verified_at: now } : {}),
			updated_at: now
		})
		.where(eq(emailDomains.org_id, parsed.data.id))
		.returning();

	// Register the Brevo webhooks (idempotent). The per-org inbound parse webhook
	// only registers once the RECEIVING domain is verified in Brevo — Brevo rejects
	// it with "Domain is not found or is inactive" otherwise. The account-wide
	// transactional events webhook is tied to the sending domain being ready.
	// Failures here are non-fatal — DNS may still be propagating; the PO can
	// re-click Verify to retry registration.
	const receivingActive = receiving.verified || receiving.authenticated;
	let webhookError: string | undefined;
	if (receivingActive || isReady) {
		const baseUrl = (env.APP_URL ?? url.origin).replace(/\/$/, '');
		const inboundDomain = updated.inbound_domain;
		try {
			if (receivingActive) {
				const inboundUrl = `${baseUrl}/api/webhooks/brevo/inbound/${updated.inbound_webhook_token}/${inboundDomain}`;
				const inboundWebhookId = await ensureInboundWebhook(inboundDomain, inboundUrl);
				if (inboundWebhookId && inboundWebhookId !== updated.brevo_inbound_webhook_id) {
					await db
						.update(emailDomains)
						.set({ brevo_inbound_webhook_id: inboundWebhookId, updated_at: new Date() })
						.where(eq(emailDomains.org_id, parsed.data.id));
					updated.brevo_inbound_webhook_id = inboundWebhookId;
				}
			}

			if (isReady) {
				const eventsSecret = env.BREVO_EVENTS_WEBHOOK_SECRET;
				if (eventsSecret) {
					await ensureTransactionalWebhook(`${baseUrl}/api/webhooks/brevo/events/${eventsSecret}`);
				} else {
					log.warn({ phase: 'events_secret_missing', org_id: parsed.data.id });
				}
			}
		} catch (e) {
			webhookError = e instanceof Error ? e.message : 'Could not register Brevo webhooks.';
			log.error({ phase: 'webhook_register_failed', org_id: parsed.data.id, error: webhookError });
		}
	}

	return json({
		data: { domain: updated, ...(webhookError ? { webhook_error: webhookError } : {}) }
	});
};
