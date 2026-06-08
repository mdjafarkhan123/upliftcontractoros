const env = process.env;

export type TwilioBalance = {
	/**
	 * Spendable credit the master account can use. Twilio has no separate
	 * credit-limit concept (unlike Telnyx), so this equals the raw balance — it is
	 * the number the safety floor compares against.
	 */
	availableCredit: number;
	/** Raw account balance (informational; same value as availableCredit). */
	balance: number;
	currency: string;
};

/**
 * Fetch the PO's master Twilio account balance.
 *
 * Twilio `GET /2010-04-01/Accounts/{AccountSid}/Balance.json` (HTTP Basic auth
 * with AccountSid:AuthToken) returns string money fields:
 *   { account_sid, balance, currency }
 *
 * `balance` is the remaining account balance and can be negative on a postpaid
 * account. Throws on a non-2xx response so the caller (cron / on-demand refresh)
 * can log and leave the cached value untouched.
 */
export async function fetchTwilioBalance(): Promise<TwilioBalance> {
	const sid = env.TWILIO_ACCOUNT_SID;
	const token = env.TWILIO_AUTH_TOKEN;
	if (!sid || !token) {
		throw new Error('TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN are required.');
	}

	const auth = Buffer.from(`${sid}:${token}`).toString('base64');
	const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Balance.json`, {
		headers: { Authorization: `Basic ${auth}` }
	});

	if (!res.ok) {
		const errBody = await res.text().catch(() => '');
		throw new Error(`Twilio balance fetch failed: ${res.status} ${errBody}`);
	}

	const json = (await res.json()) as { balance?: string; currency?: string };
	const balance = Number(json.balance ?? 0);
	return {
		availableCredit: balance,
		balance,
		currency: json.currency ?? 'USD'
	};
}
