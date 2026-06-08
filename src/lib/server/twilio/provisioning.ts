import Twilio from 'twilio';

const env = process.env;

// Per-contractor Twilio provisioning (Onboarding Step 3 / plan 5.2). Pure Twilio
// wrappers — NO database access. Every function here performs an external Twilio
// call and must be invoked OUTSIDE any DB transaction (transaction-boundary law).
//
// Model: each contractor gets its own Twilio SUBACCOUNT that owns its number.
// The subaccount is created with the PARENT (master) credentials; we then act on
// the subaccount by passing { accountSid: subSid } to the SDK (the API
// `--account-sid` pattern). Subaccount usage rolls up to the master balance, so
// the existing credit-ledger / master-floor model is unaffected.

function masterCreds(): { sid: string; token: string } {
	const sid = env.TWILIO_ACCOUNT_SID;
	const token = env.TWILIO_AUTH_TOKEN;
	if (!sid || !token) {
		throw new Error('TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN are required.');
	}
	return { sid, token };
}

/** Master-account client (parent credentials). */
function masterClient() {
	const { sid, token } = masterCreds();
	return Twilio(sid, token);
}

/**
 * Client scoped to act on a subaccount, authenticated with the PARENT
 * credentials + the subaccount SID (Twilio `{ accountSid }` option). Used to
 * purchase/configure numbers that live under the contractor's subaccount.
 */
function subaccountClient(subSid: string) {
	const { sid, token } = masterCreds();
	return Twilio(sid, token, { accountSid: subSid });
}

export type ProvisionedSubaccount = {
	/** Subaccount AccountSid — store on organizations.twilio_subaccount_sid. */
	sid: string;
	/** Subaccount AuthToken — store on organizations.twilio_subaccount_auth_token. */
	authToken: string;
};

/**
 * Create a Twilio subaccount under the master account. Returns the subaccount's
 * SID and AuthToken — BOTH must be persisted: the SID scopes future API calls and
 * the AuthToken validates inbound webhooks for numbers the subaccount owns.
 */
export async function createSubaccount(friendlyName: string): Promise<ProvisionedSubaccount> {
	const account = await masterClient().api.v2010.accounts.create({ friendlyName });
	return { sid: account.sid, authToken: account.authToken };
}

export type AvailableNumber = {
	phoneNumber: string;
	friendlyName: string;
	locality: string | null;
	region: string | null;
};

/**
 * Search the master account's available-number inventory for local numbers in a
 * postal code that support both SMS and voice. Inventory is Twilio-wide, so this
 * runs on the master client before the subaccount exists.
 *
 * `country` is an ISO 3166-1 alpha-2 code. Throws if Twilio rejects the country
 * (caller maps to a friendly message); returns [] when no numbers match.
 */
export async function searchAvailableNumbers(
	country: string,
	postalCode: string
): Promise<AvailableNumber[]> {
	const results = await masterClient()
		.availablePhoneNumbers(country)
		.local.list({ inPostalCode: postalCode, smsEnabled: true, voiceEnabled: true, limit: 10 });

	return results.map((n) => ({
		phoneNumber: n.phoneNumber,
		friendlyName: n.friendlyName,
		locality: n.locality || null,
		region: n.region || null
	}));
}

/**
 * Purchase `phoneNumber` under the contractor's subaccount and wire its webhooks
 * to our handlers. SMS + voice + delivery-status all POST to APP_URL routes.
 * Requires APP_URL — without it the number would have no working webhooks, so we
 * fail before touching Twilio. Returns the purchased number's SID.
 */
export async function purchaseNumber(subSid: string, phoneNumber: string): Promise<string> {
	const appUrl = env.APP_URL;
	if (!appUrl) {
		throw new Error('APP_URL is required to configure number webhooks.');
	}
	const base = appUrl.replace(/\/$/, '');

	const incoming = await subaccountClient(subSid).incomingPhoneNumbers.create({
		phoneNumber,
		smsUrl: `${base}/api/webhooks/twilio/sms`,
		smsMethod: 'POST',
		voiceUrl: `${base}/api/webhooks/twilio/voice`,
		voiceMethod: 'POST',
		statusCallback: `${base}/api/webhooks/twilio/status`,
		statusCallbackMethod: 'POST'
	});

	return incoming.sid;
}
