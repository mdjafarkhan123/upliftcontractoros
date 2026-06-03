import { resolveMx } from 'node:dns/promises';
import type { EmailDnsRecord } from '$lib/server/db/schema';

/**
 * Brevo never reports inbound MX status — its domain check only covers the
 * SENDING records (DKIM, brevo-code). So we resolve the receiving subdomain's MX
 * ourselves and stamp each inbound_mx record's `status` from live DNS. This keeps
 * the jafar panel honest: a receiving row only shows "Verified" once its MX is
 * actually published and pointing at Brevo. NXDOMAIN / no-MX → status false.
 */
export async function annotateInboundMxStatus(
	records: EmailDnsRecord[],
	inboundDomain: string
): Promise<EmailDnsRecord[]> {
	if (!records.some((r) => r.purpose === 'inbound_mx')) return records;

	let exchanges: string[] = [];
	try {
		const mx = await resolveMx(inboundDomain);
		exchanges = mx.map((r) => r.exchange.toLowerCase().replace(/\.$/, ''));
	} catch {
		exchanges = []; // NXDOMAIN / ENODATA — receiving subdomain not set up yet.
	}

	return records.map((r) =>
		r.purpose === 'inbound_mx'
			? { ...r, status: exchanges.includes(r.value.toLowerCase().replace(/\.$/, '')) }
			: r
	);
}
