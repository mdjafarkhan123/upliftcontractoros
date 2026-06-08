import type { EmailDnsRecord } from '$lib/server/db/schema';
import { brevoFetch, BrevoError } from './request';

// Compose a full domain from a DNS-label prefix and the root domain. The sending
// and receiving domains are SIBLINGS under the same root (no nesting):
//   composeDomain('contact', 'uplift.com') → 'contact.uplift.com'
//   composeDomain('replies', 'uplift.com') → 'replies.uplift.com'
// Single source of truth — used by the create route to derive + store both
// domains. The stored `domain` / `inbound_domain` columns are read everywhere
// else, so callers never re-derive.
export function composeDomain(prefix: string, root: string): string {
	return `${prefix}.${root}`;
}

// Brevo returns one record per authentication mechanism on create. Each is the
// raw DNS row the domain owner must publish. `status` reflects whether Brevo has
// already seen it (false until DNS propagates and a check runs).
type BrevoDnsRecord = {
	type: string;
	value: string;
	host_name: string;
	status: boolean;
};

type BrevoDnsRecords = {
	// Legacy single-TXT DKIM (older Brevo accounts).
	dkim_record?: BrevoDnsRecord | null;
	// Current Brevo API: two CNAME DKIM records under dkim1Record / dkim2Record.
	dkim1Record?: BrevoDnsRecord | null;
	dkim2Record?: BrevoDnsRecord | null;
	brevo_code?: BrevoDnsRecord | null;
	dmarc_record?: BrevoDnsRecord | null;
	// Tolerate any other record keys Brevo adds.
	[key: string]: BrevoDnsRecord | null | undefined;
};

type BrevoCreateResponse = {
	id?: number | string;
	domain_name?: string;
	message?: string;
	dns_records?: BrevoDnsRecords;
};

type BrevoGetResponse = {
	domain?: string;
	verified?: boolean;
	authenticated?: boolean;
	dns_records?: BrevoDnsRecords;
};

// Status + raw DNS payload for a single Brevo domain. Callers build the display
// records themselves (combining the sending + receiving domains) via
// buildDnsRecords — neither domain's payload is enough on its own.
export type BrevoDomainStatus = {
	brevoDomainId: string | null;
	verified: boolean;
	authenticated: boolean;
	raw: BrevoDnsRecords | undefined;
};

// Build the DKIM + brevo-code + DMARC rows for one Brevo domain. Both the sending
// and receiving domains need the full set: Brevo only marks a domain "active"
// (and so only attaches an inbound parse webhook to it) once it authenticates,
// and its authenticate check demands brevo-code AND DKIM AND DMARC all present.
function buildAuthRecords(
	domain: string,
	scope: 'sending' | 'receiving',
	raw: BrevoDnsRecords | undefined
): EmailDnsRecord[] {
	const records: EmailDnsRecord[] = [];

	// DKIM — Brevo's current API returns two CNAME records (dkim1Record/dkim2Record);
	// older accounts returned a single TXT dkim_record. Pull every dkim* key so we
	// never silently drop a record Brevo expects.
	const dkimKeys = Object.keys(raw ?? {}).filter((k) => /^dkim/i.test(k));
	const labelledDkim = dkimKeys.length > 1;
	let dkimIndex = 0;
	for (const key of dkimKeys) {
		const rec = raw?.[key];
		if (!rec) continue;
		dkimIndex += 1;
		// Brevo returns the DKIM host relative to the domain (e.g. "brevo1._domainkey"),
		// unlike brevo_code/DMARC which already include the subdomain. Left as-is, a PO
		// publishes DKIM one level too high and Brevo never authenticates. Anchor it to
		// this domain as an FQDN.
		const host =
			rec.host_name && !rec.host_name.endsWith(domain)
				? `${rec.host_name}.${domain}`
				: rec.host_name;
		records.push({
			type: rec.type === 'CNAME' ? 'CNAME' : 'TXT',
			host,
			value: rec.value,
			purpose: 'dkim',
			label: labelledDkim ? `DKIM ${dkimIndex} (email signature)` : 'DKIM (email signature)',
			scope,
			status: rec.status
		});
	}

	if (raw?.brevo_code) {
		records.push({
			type: 'TXT',
			host: raw.brevo_code.host_name,
			value: raw.brevo_code.value,
			purpose: 'brevo_code',
			label: 'Domain verification',
			scope,
			status: raw.brevo_code.status
		});
	}

	// DMARC — prefer Brevo's returned record; otherwise suggest a safe default.
	if (raw?.dmarc_record) {
		records.push({
			type: 'TXT',
			host: raw.dmarc_record.host_name,
			value: raw.dmarc_record.value,
			purpose: 'dmarc',
			label: 'DMARC (recommended)',
			scope,
			status: raw.dmarc_record.status
		});
	} else {
		records.push({
			type: 'TXT',
			host: `_dmarc.${domain}`,
			value: 'v=DMARC1; p=none;',
			purpose: 'dmarc',
			label: 'DMARC (recommended)',
			scope
		});
	}

	return records;
}

// Map Brevo's raw create/get payloads into the records we render in the panel.
// `raw` is the SENDING domain's payload, `rawReceiving` the RECEIVING domain's.
// Both domains get the full auth set (DKIM/brevo-code/DMARC); the receiving group
// also carries the inbound MX rows that route replies to Brevo.
export function buildDnsRecords(
	domain: string,
	inboundDomain: string,
	raw: BrevoDnsRecords | undefined,
	rawReceiving?: BrevoDnsRecords | undefined
): EmailDnsRecord[] {
	const records: EmailDnsRecord[] = [...buildAuthRecords(domain, 'sending', raw)];

	if (rawReceiving) {
		records.push(...buildAuthRecords(inboundDomain, 'receiving', rawReceiving));
	}

	// Inbound MX — Brevo refuses to parse inbound mail on the sending domain, so
	// replies are received on the dedicated receiving subdomain (a sibling of the
	// sending domain under the same root). These MX records must be published on
	// that receiving subdomain, NOT the sending one.
	records.push({
		type: 'MX',
		host: inboundDomain,
		value: 'inbound1.sendinblue.com',
		priority: 10,
		purpose: 'inbound_mx',
		label: 'Receiving mail',
		scope: 'receiving'
	});
	records.push({
		type: 'MX',
		host: inboundDomain,
		value: 'inbound2.sendinblue.com',
		priority: 20,
		purpose: 'inbound_mx',
		label: 'Receiving mail',
		scope: 'receiving'
	});

	return records;
}

// Sending-only DNS records for a single domain — DKIM + brevo-code + DMARC, no
// inbound MX. Used by the PLATFORM system email domain (outbound-only), unlike the
// per-org flow which also receives replies. Wraps the shared buildAuthRecords.
export function buildSendingDnsRecords(
	domain: string,
	raw: BrevoDnsRecords | undefined
): EmailDnsRecord[] {
	return buildAuthRecords(domain, 'sending', raw);
}

// POST /v3/senders/domains — register a domain (sending or receiving) with Brevo.
// Returns its status + raw DNS payload; callers build display records themselves.
export async function createBrevoDomain(name: string): Promise<BrevoDomainStatus> {
	const data = await brevoFetch<BrevoCreateResponse>('/senders/domains', {
		method: 'POST',
		body: { name }
	});
	return {
		brevoDomainId: data.id != null ? String(data.id) : null,
		verified: false,
		authenticated: false,
		raw: data.dns_records
	};
}

// GET /v3/senders/domains/{domainName} — current verification status + records.
export async function getBrevoDomain(name: string): Promise<BrevoDomainStatus> {
	const data = await brevoFetch<BrevoGetResponse>(`/senders/domains/${encodeURIComponent(name)}`, {
		method: 'GET'
	});
	return {
		brevoDomainId: null,
		verified: data.verified ?? false,
		authenticated: data.authenticated ?? false,
		raw: data.dns_records
	};
}

// Read a domain's status, registering it with Brevo if it isn't there yet. Used
// for the RECEIVING domain, which must exist + be verified in Brevo before an
// inbound parse webhook can attach to it. Idempotent: a 404 (not registered) is
// turned into a POST; any other Brevo error propagates. Also self-heals existing
// orgs whose receiving domain predates this registration step.
export async function ensureBrevoDomain(name: string): Promise<BrevoDomainStatus> {
	try {
		return await getBrevoDomain(name);
	} catch (err) {
		if (err instanceof BrevoError && err.status === 404) return await createBrevoDomain(name);
		throw err;
	}
}

// PUT /v3/senders/domains/{domainName}/authenticate — trigger an auth check.
export async function authenticateBrevoDomain(name: string): Promise<void> {
	await brevoFetch<unknown>(`/senders/domains/${encodeURIComponent(name)}/authenticate`, {
		method: 'PUT'
	});
}

// DELETE /v3/senders/domains/{domainName} — remove the sending domain from Brevo.
// Idempotent: a 404 (already gone) is treated as success so cleanup never blocks
// on a domain that's no longer there.
export async function deleteBrevoDomain(name: string): Promise<void> {
	try {
		await brevoFetch<unknown>(`/senders/domains/${encodeURIComponent(name)}`, { method: 'DELETE' });
	} catch (err) {
		if (err instanceof BrevoError && err.status === 404) return;
		throw err;
	}
}
