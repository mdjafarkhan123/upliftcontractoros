/**
 * GET/POST/DELETE /api/admin/orgs/[id]/email-domain
 *
 * Jafar admin only — /api/admin/* is guarded by hooks.server.ts (401 without a
 * jafar session). No checkPermission, no contractor org context: jafar is fully
 * isolated (CLAUDE.md rule 12). The target org is the [id] route param.
 *
 * PO-operated Brevo domain onboarding (Phase 1): register a sending domain with
 * Brevo, mint the inbound webhook token, store the DNS records for display. The
 * inbound webhook handler itself is Phase 2 — only its token + path are set up now.
 */
import { error, json } from '@sveltejs/kit';
import { eq, or } from 'drizzle-orm';
import { z } from 'zod';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { organizations, emailDomains, type NewEmailDomain } from '$lib/server/db/schema';
import {
	createBrevoDomain,
	ensureBrevoDomain,
	deleteBrevoDomain,
	buildDnsRecords,
	composeDomain
} from '$lib/server/email/brevo/client';
import { deleteWebhook } from '$lib/server/email/brevo/webhooks';
import { BrevoError } from '$lib/server/email/brevo/request';
import { generateInboundWebhookToken } from '$lib/server/email/brevo/token';
import { annotateInboundMxStatus } from '$lib/server/email/inboundMx';

const paramsSchema = z.object({ id: z.string().uuid() });

// A single DNS label: lowercase alphanumeric + hyphens, 1–63 chars, no leading or
// trailing hyphen. Used for both the sending and receiving prefix.
const dnsLabel = z
	.string()
	.trim()
	.toLowerCase()
	.regex(
		/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/,
		'Use only letters, numbers and hyphens (no dots or spaces).'
	);

// Root domain (apex or any base): >= 2 labels, e.g. upliftcontractor.com. The PO
// may paste a URL — strip protocol and a leading www. before validating.
const rootDomainSchema = z
	.string()
	.trim()
	.toLowerCase()
	.transform((v) =>
		v
			.replace(/^https?:\/\//, '')
			.replace(/\/.*$/, '')
			.replace(/^www\./, '')
	)
	.pipe(
		z
			.string()
			.max(253, 'Domain is too long.')
			.regex(
				/^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/,
				'Enter a domain like theirbusiness.com'
			)
	);

// Root domain + prefixes. The full sending/receiving domains are derived from
// these — never sent by the client. The sending prefix is OPTIONAL: an empty
// string (or omitted) means send from the apex/root (info@theirbusiness.com).
// The receiving prefix stays required — replies can never route to the apex.
const optionalSendingPrefix = z.preprocess(
	(v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
	dnsLabel.optional()
);
const bodySchema = z
	.object({
		root_domain: rootDomainSchema,
		sending_prefix: optionalSendingPrefix,
		inbound_prefix: dnsLabel
	})
	.refine((v) => !v.sending_prefix || v.sending_prefix !== v.inbound_prefix, {
		message: 'Sending and receiving prefixes must be different.',
		path: ['inbound_prefix']
	});

function fieldErrors(err: z.ZodError) {
	return Object.fromEntries(err.issues.map((i) => [String(i.path[0] ?? ''), i.message]));
}

// The {domain} segment is the RECEIVING subdomain — the inbound route resolves
// the org by email_domains.inbound_domain. Lives under the public /api/webhooks
// prefix (hooks.server.ts auto-allows it).
function inboundWebhookPath(token: string, inboundDomain: string): string {
	return `/api/webhooks/brevo/inbound/${token}/${inboundDomain}`;
}

export const GET: RequestHandler = async ({ params }) => {
	const parsed = paramsSchema.safeParse(params);
	if (!parsed.success) throw error(400, 'Invalid organization ID.');

	const [row] = await db
		.select()
		.from(emailDomains)
		.where(eq(emailDomains.org_id, parsed.data.id))
		.limit(1);

	if (!row) {
		return json({ data: { domain: null, inbound_webhook_path: null } });
	}

	// Brevo doesn't track inbound MX — resolve it live so the panel shows honest
	// "Verified"/"Add record" status for the receiving (replies) records.
	const dns_records = row.dns_records
		? await annotateInboundMxStatus(row.dns_records, row.inbound_domain)
		: row.dns_records;

	return json({
		data: {
			domain: { ...row, dns_records },
			inbound_webhook_path: inboundWebhookPath(row.inbound_webhook_token, row.inbound_domain)
		}
	});
};

export const POST: RequestHandler = async ({ params, request }) => {
	const parsedParams = paramsSchema.safeParse(params);
	if (!parsedParams.success) throw error(400, 'Invalid organization ID.');
	const orgId = parsedParams.data.id;

	const raw = await request.json().catch(() => ({}));
	const parsed = bodySchema.safeParse(raw);
	if (!parsed.success) {
		return json(
			{ error: 'Invalid request body.', field_errors: fieldErrors(parsed.error) },
			{ status: 400 }
		);
	}
	const { root_domain, sending_prefix, inbound_prefix } = parsed.data;
	// Derive both domains as siblings under the root — no nesting.
	const domain = composeDomain(sending_prefix, root_domain);
	const inboundDomain = composeDomain(inbound_prefix, root_domain);

	const [org] = await db
		.select({ id: organizations.id })
		.from(organizations)
		.where(eq(organizations.id, orgId))
		.limit(1);
	if (!org) throw error(404, 'Organization not found.');

	// One domain per org in Phase 1. DELETE first to redo setup.
	const [existing] = await db
		.select({ id: emailDomains.id })
		.from(emailDomains)
		.where(eq(emailDomains.org_id, orgId))
		.limit(1);
	if (existing) {
		return json(
			{ error: 'This organization already has an email domain. Delete it to start over.' },
			{ status: 409 }
		);
	}

	// Reject a sending or receiving domain already claimed by another org before
	// calling Brevo (both are uniquely indexed).
	const [domainTaken] = await db
		.select({ id: emailDomains.id })
		.from(emailDomains)
		.where(or(eq(emailDomains.domain, domain), eq(emailDomains.inbound_domain, inboundDomain)))
		.limit(1);
	if (domainTaken) {
		return json(
			{ error: 'That sending or receiving domain is already registered to another organization.' },
			{ status: 409 }
		);
	}

	// External calls OUTSIDE any transaction (CLAUDE.md rule 8). Insert the row only
	// on success so we never leave a half-created record. Register BOTH domains with
	// Brevo: the sending domain (DKIM/auth) and the receiving domain (must be
	// verified before an inbound parse webhook can attach to it). Build the combined
	// DNS records from both payloads so the panel shows everything the PO must add.
	let brevo;
	let receivingRaw;
	try {
		brevo = await createBrevoDomain(domain);
		receivingRaw = (await ensureBrevoDomain(inboundDomain)).raw;
	} catch (e) {
		// Brevo rejects a domain that already exists in the account (404 +
		// duplicate_parameter). DNS deleted at the registrar does NOT remove it from
		// Brevo — give the PO an actionable message instead of a raw gateway error.
		if (e instanceof BrevoError && e.code === 'duplicate_parameter') {
			return json(
				{
					error: `${domain} is already registered in Brevo. Remove it (Brevo dashboard, or the organization that owns it) and try again.`
				},
				{ status: 409 }
			);
		}
		const message = e instanceof Error ? e.message : 'Could not register the domain with Brevo.';
		return json({ error: message }, { status: 502 });
	}

	const token = generateInboundWebhookToken();
	const values: NewEmailDomain = {
		org_id: orgId,
		root_domain,
		sending_prefix: sending_prefix ?? null,
		inbound_prefix,
		domain,
		inbound_domain: inboundDomain,
		brevo_domain_id: brevo.brevoDomainId,
		inbound_webhook_token: token,
		status: 'pending',
		brevo_verified: brevo.verified,
		brevo_authenticated: brevo.authenticated,
		dns_records: buildDnsRecords(domain, inboundDomain, brevo.raw, receivingRaw)
	};
	const [inserted] = await db.insert(emailDomains).values(values).returning();

	return json(
		{
			data: {
				domain: inserted,
				inbound_webhook_path: inboundWebhookPath(token, inboundDomain)
			}
		},
		{ status: 201 }
	);
};

export const DELETE: RequestHandler = async ({ params }) => {
	const parsed = paramsSchema.safeParse(params);
	if (!parsed.success) throw error(400, 'Invalid organization ID.');

	const [row] = await db
		.select()
		.from(emailDomains)
		.where(eq(emailDomains.org_id, parsed.data.id))
		.limit(1);
	// Nothing to remove — idempotent.
	if (!row) return new Response(null, { status: 204 });

	// External cleanup OUTSIDE any transaction (CLAUDE.md rule 8). Remove the
	// per-org inbound parse webhook + the sending domain from Brevo so the slot is
	// free to re-register. Both tolerate "already gone". If Brevo hard-fails we keep
	// the DB row so Brevo and our DB stay in sync — the PO can retry Remove. (The
	// account-wide transactional events webhook is shared and never deleted here.)
	try {
		if (row.brevo_inbound_webhook_id) await deleteWebhook(row.brevo_inbound_webhook_id);
		await deleteBrevoDomain(row.domain);
		// Also free the receiving domain we registered with Brevo (tolerates 404).
		await deleteBrevoDomain(row.inbound_domain);
	} catch (e) {
		const message = e instanceof Error ? e.message : 'Could not remove the domain from Brevo.';
		return json({ error: message }, { status: 502 });
	}

	await db.delete(emailDomains).where(eq(emailDomains.org_id, parsed.data.id));
	return new Response(null, { status: 204 });
};
