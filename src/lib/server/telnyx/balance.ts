import { telnyxApiKey } from './client';

export type TelnyxBalance = {
	/** Spendable credit = balance + credit_limit. The number the floor compares. */
	availableCredit: number;
	/** Raw account balance (informational). */
	balance: number;
	currency: string;
};

/**
 * Fetch the PO's master Telnyx account balance.
 *
 * Telnyx `GET /v2/balance` returns string money fields under `data`:
 *   { available_credit, balance, credit_limit, currency }
 *
 * We treat `available_credit` as authoritative for the safety floor — it is what
 * the account can actually spend. Throws on a non-2xx response so the caller
 * (cron / on-demand refresh) can log and leave the cached value untouched.
 */
export async function fetchTelnyxBalance(): Promise<TelnyxBalance> {
	const res = await fetch('https://api.telnyx.com/v2/balance', {
		headers: { Authorization: `Bearer ${telnyxApiKey()}` }
	});

	if (!res.ok) {
		const errBody = await res.text().catch(() => '');
		throw new Error(`Telnyx balance fetch failed: ${res.status} ${errBody}`);
	}

	const json = (await res.json()) as {
		data: { available_credit?: string; balance?: string; currency?: string };
	};
	const d = json.data ?? {};
	return {
		availableCredit: Number(d.available_credit ?? d.balance ?? 0),
		balance: Number(d.balance ?? 0),
		currency: d.currency ?? 'USD'
	};
}
