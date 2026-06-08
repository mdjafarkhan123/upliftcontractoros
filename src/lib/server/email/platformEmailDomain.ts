// PO-managed PLATFORM system email sending domain. Outbound-only, singleton mirror
// of the per-org email_domains flow (src/routes/api/admin/orgs/[id]/email-domain):
// register a dedicated subdomain (e.g. notifications.upliftcontractor.com) with
// Brevo, surface the DKIM/verification/DMARC records for the PO to add in DNS, and
// verify. Once verified, systemFromAddress() sends all system/PO mail from it.
//
// Lives on the platform_settings singleton (id='global'), so there is no org scope
// and no inbound MX / reply parsing / webhook token (system mail is one-way).
// /api/admin/* is jafar-session-guarded (CLAUDE.md rule 12) — never reachable from
// contractor routes. External Brevo calls happen OUTSIDE any transaction (rule 8).

import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '$lib/server/db/client';
import { platformSettings, type EmailDnsRecord } from '$lib/server/db/schema';
import {
	createBrevoDomain,
	getBrevoDomain,
	authenticateBrevoDomain,
	deleteBrevoDomain,
	buildSendingDnsRecords,
	composeDomain
} from './brevo/client';
import { BrevoError } from './brevo/request';

const SINGLETON_ID = 'global';

// A single DNS label: lowercase alphanumeric + hyphens, no leading/trailing hyphen.
const dnsLabel = z
	.string()
	.trim()
	.toLowerCase()
	.regex(
		/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/,
		'Use only letters, numbers and hyphens (no dots or spaces).'
	);

// Root domain — strip protocol / path / leading www. before validating.
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
				'Enter a domain like yourcompany.com'
			)
	);

export const platformEmailCreateSchema = z.object({
	root_domain: rootDomainSchema,
	sending_prefix: dnsLabel,
	// Email local-part for the From address (e.g. "noreply").
	from_local: z
		.string()
		.trim()
		.toLowerCase()
		.regex(/^[a-z0-9._-]+$/, 'Use only letters, numbers and . _ - characters.')
		.max(64)
		.default('noreply'),
	from_name: z.string().trim().min(1, 'Sender name is required.').max(100).default('Uplift Contractor')
});

export type PlatformEmailCreateInput = z.infer<typeof platformEmailCreateSchema>;

export type PlatformEmailState = {
	domain: string | null;
	root_domain: string | null;
	sending_prefix: string | null;
	from_local: string;
	from_name: string;
	from_address: string | null;
	status: 'pending' | 'verifying' | 'verified' | 'failed' | null;
	brevo_verified: boolean;
	brevo_authenticated: boolean;
	dns_records: EmailDnsRecord[] | null;
	last_checked_at: string | null;
	verified_at: string | null;
};

export type PlatformEmailResult =
	| { ok: true; state: PlatformEmailState }
	| { ok: false; status: number; error: string; field_errors?: Record<string, string> };

/** Read the singleton config row, creating it on first access if missing. */
async function getRow() {
	const [row] = await db
		.select()
		.from(platformSettings)
		.where(eq(platformSettings.id, SINGLETON_ID))
		.limit(1);
	if (row) return row;
	await db.insert(platformSettings).values({ id: SINGLETON_ID }).onConflictDoNothing();
	const [created] = await db
		.select()
		.from(platformSettings)
		.where(eq(platformSettings.id, SINGLETON_ID))
		.limit(1);
	return created;
}

type Row = Awaited<ReturnType<typeof getRow>>;

function toState(row: Row): PlatformEmailState {
	const fromAddress = row.system_email_domain
		? `${row.system_email_from_local || 'noreply'}@${row.system_email_domain}`
		: null;
	return {
		domain: row.system_email_domain,
		root_domain: row.system_email_root_domain,
		sending_prefix: row.system_email_sending_prefix,
		from_local: row.system_email_from_local,
		from_name: row.system_email_from_name,
		from_address: fromAddress,
		status: row.system_email_status,
		brevo_verified: row.system_email_brevo_verified,
		brevo_authenticated: row.system_email_brevo_authenticated,
		dns_records: row.system_email_dns_records,
		last_checked_at: row.system_email_last_checked_at?.toISOString() ?? null,
		verified_at: row.system_email_verified_at?.toISOString() ?? null
	};
}

/** Current platform system email domain state for the /jafar panel. */
export async function getPlatformEmailState(): Promise<PlatformEmailState> {
	return toState(await getRow());
}

/** Register a new platform system sending domain with Brevo and store its records. */
export async function createPlatformEmailDomain(
	input: PlatformEmailCreateInput
): Promise<PlatformEmailResult> {
	const row = await getRow();
	// One platform domain at a time. Remove the existing one to start over.
	if (row.system_email_domain) {
		return {
			ok: false,
			status: 409,
			error: 'A platform email domain is already set up. Remove it to start over.'
		};
	}

	const domain = composeDomain(input.sending_prefix, input.root_domain);

	let brevo;
	try {
		brevo = await createBrevoDomain(domain);
	} catch (e) {
		// Brevo rejects a domain already present in the account.
		if (e instanceof BrevoError && e.code === 'duplicate_parameter') {
			return {
				ok: false,
				status: 409,
				error: `${domain} is already registered in Brevo. Remove it from the Brevo dashboard and try again.`
			};
		}
		const message = e instanceof Error ? e.message : 'Could not register the domain with Brevo.';
		return { ok: false, status: 502, error: message };
	}

	const [updated] = await db
		.update(platformSettings)
		.set({
			system_email_root_domain: input.root_domain,
			system_email_sending_prefix: input.sending_prefix,
			system_email_domain: domain,
			system_email_from_local: input.from_local,
			system_email_from_name: input.from_name,
			system_email_brevo_domain_id: brevo.brevoDomainId,
			system_email_status: 'pending',
			system_email_brevo_verified: brevo.verified,
			system_email_brevo_authenticated: brevo.authenticated,
			system_email_dns_records: buildSendingDnsRecords(domain, brevo.raw),
			system_email_last_checked_at: null,
			system_email_verified_at: null,
			updated_at: new Date()
		})
		.where(eq(platformSettings.id, SINGLETON_ID))
		.returning();

	return { ok: true, state: toState(updated) };
}

/** Trigger a Brevo auth check, read the current status, and persist it. */
export async function verifyPlatformEmailDomain(): Promise<PlatformEmailResult> {
	const row = await getRow();
	if (!row.system_email_domain) {
		return { ok: false, status: 404, error: 'No platform email domain is set up.' };
	}
	const domain = row.system_email_domain;

	let result;
	try {
		// authenticate() errors while DNS is missing/propagating — a normal "still
		// pending" state. Always fall through to GET for the authoritative status.
		try {
			await authenticateBrevoDomain(domain);
		} catch {
			// ignore — status read authoritatively below
		}
		result = await getBrevoDomain(domain);
	} catch (e) {
		const message = e instanceof Error ? e.message : 'Could not check the domain with Brevo.';
		return { ok: false, status: 502, error: message };
	}

	const isReady = result.verified && result.authenticated;
	const now = new Date();
	const [updated] = await db
		.update(platformSettings)
		.set({
			system_email_brevo_verified: result.verified,
			system_email_brevo_authenticated: result.authenticated,
			system_email_status: isReady ? 'verified' : 'verifying',
			system_email_dns_records: buildSendingDnsRecords(domain, result.raw),
			system_email_last_checked_at: now,
			...(isReady && !row.system_email_verified_at ? { system_email_verified_at: now } : {}),
			updated_at: now
		})
		.where(eq(platformSettings.id, SINGLETON_ID))
		.returning();

	return { ok: true, state: toState(updated) };
}

/** Remove the platform system domain from Brevo and clear its setup. Idempotent. */
export async function deletePlatformEmailDomain(): Promise<PlatformEmailResult> {
	const row = await getRow();
	if (!row.system_email_domain) {
		// Nothing to remove — idempotent.
		return { ok: true, state: toState(row) };
	}

	try {
		await deleteBrevoDomain(row.system_email_domain);
	} catch (e) {
		const message = e instanceof Error ? e.message : 'Could not remove the domain from Brevo.';
		return { ok: false, status: 502, error: message };
	}

	const [updated] = await db
		.update(platformSettings)
		.set({
			system_email_root_domain: null,
			system_email_sending_prefix: null,
			system_email_domain: null,
			system_email_brevo_domain_id: null,
			system_email_status: null,
			system_email_brevo_verified: false,
			system_email_brevo_authenticated: false,
			system_email_dns_records: null,
			system_email_last_checked_at: null,
			system_email_verified_at: null,
			updated_at: new Date()
		})
		.where(eq(platformSettings.id, SINGLETON_ID))
		.returning();

	return { ok: true, state: toState(updated) };
}
