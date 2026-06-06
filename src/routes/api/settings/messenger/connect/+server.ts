import { error, redirect } from '@sveltejs/kit';
import { randomBytes } from 'node:crypto';
import type { RequestHandler } from './$types';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import {
	messengerGraphVersion,
	messengerRedirectUri,
	metaAppId
} from '$lib/server/messenger/client';
import { setStateCookie } from '$lib/server/messenger/oauthCookies';

// Scopes for a Messenger integration:
//   pages_show_list        — enumerate the user's Pages (/me/accounts)
//   pages_messaging        — send/receive messages on the Page (Send API, Stage 5)
//   pages_manage_metadata  — subscribe the Page to our webhook (subscribed_apps)
const SCOPES = 'pages_show_list,pages_messaging,pages_manage_metadata';

/**
 * Begin the Facebook Login connect flow. Admin-only (Integrations is an
 * admin-only section with no fine-grained boolean — mirrors the Stripe settings
 * route) and gated on the org's `feature_messenger` flag. Sets a signed CSRF
 * state cookie, then 302s to Meta's OAuth dialog. Meta calls /callback after.
 */
export const GET: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (auth.member.role !== 'admin') error(403, 'Admin only.');
	if (!auth.org.feature_messenger) error(403, 'Messenger is not enabled for this organization.');

	const nonce = randomBytes(16).toString('hex');
	setStateCookie(event.cookies, nonce, auth.orgId, auth.member.id);

	const dialog = new URL(`https://www.facebook.com/${messengerGraphVersion()}/dialog/oauth`);
	dialog.searchParams.set('client_id', metaAppId());
	dialog.searchParams.set('redirect_uri', messengerRedirectUri());
	dialog.searchParams.set('state', nonce);
	dialog.searchParams.set('scope', SCOPES);
	dialog.searchParams.set('response_type', 'code');

	throw redirect(302, dialog.toString());
};
