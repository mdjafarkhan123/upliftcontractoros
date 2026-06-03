import webPush from 'web-push';
import type { PushPayload } from '$lib/notifications/types';

const env = process.env;

let initialized = false;

function init() {
	if (initialized) return;
	const pub = env.VAPID_PUBLIC_KEY;
	const priv = env.VAPID_PRIVATE_KEY;
	const email = env.VAPID_CONTACT_EMAIL;
	if (!pub || !priv || !email) {
		throw new Error(
			'[push] VAPID env vars missing — set VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_CONTACT_EMAIL'
		);
	}
	webPush.setVapidDetails(`mailto:${email}`, pub, priv);
	initialized = true;
}

export type SendPushResult = { ok: true } | { expired: true } | { error: string };

export async function sendPush(
	endpoint: string,
	p256dh: string,
	auth: string,
	payload: PushPayload
): Promise<SendPushResult> {
	try {
		init();
		await webPush.sendNotification(
			{ endpoint, keys: { p256dh, auth } },
			JSON.stringify(payload),
			{ TTL: 60 * 60 * 24 } // 24h TTL
		);
		return { ok: true };
	} catch (err: unknown) {
		const status = (err as { statusCode?: number }).statusCode;
		if (status === 404 || status === 410) return { expired: true };
		console.error('[push] sendPush error:', err);
		return { error: String(err) };
	}
}
