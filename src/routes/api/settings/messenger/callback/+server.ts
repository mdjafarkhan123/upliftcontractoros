import { error, redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { AuthContext } from '$lib/server/auth/loadAuthContext';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import {
	exchangeCodeForUserToken,
	exchangeForLongLivedUserToken,
	listManagedPages,
	GraphApiError,
	type ManagedPage
} from '$lib/server/messenger/graph';
import { connectPage } from '$lib/server/messenger/connect';
import {
	clearStateCookie,
	readStateCookie,
	setPendingCookie
} from '$lib/server/messenger/oauthCookies';

// Where the browser lands after the flow resolves. The Stage-6 Integrations card
// reads ?messenger=<reason> to render a success/error toast. The chooser is the
// CSR picker page shown when the account manages 2+ Pages.
const SETTINGS = '/settings/integrations';
const CHOOSE = '/settings/messenger/choose';

// Keep the signed pending cookie comfortably under the ~4KB per-cookie limit
// (each Page carries a ~200-char token). Contractors realistically manage 1–3.
const MAX_PICKER_PAGES = 10;

function back(reason: string): never {
	throw redirect(302, `${SETTINGS}?messenger=${encodeURIComponent(reason)}`);
}

function logErr(auth: AuthContext, err: unknown): void {
	console.warn(
		JSON.stringify({
			request_id: crypto.randomUUID(),
			org_id: auth.orgId,
			member_id: auth.member.id,
			route: 'GET /api/settings/messenger/callback',
			// Never log tokens — only the Graph error shape.
			error_kind: err instanceof GraphApiError ? `graph:${err.fbCode ?? err.status}` : 'unknown'
		})
	);
}

export const GET: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (auth.member.role !== 'admin') error(403, 'Admin only.');

	// Single-use: read then immediately invalidate the CSRF cookie.
	const state = readStateCookie(event.cookies);
	clearStateCookie(event.cookies);

	// User declined the Login dialog (?error=access_denied&error_reason=user_denied).
	if (event.url.searchParams.get('error')) back('cancelled');

	const code = event.url.searchParams.get('code');
	const returnedState = event.url.searchParams.get('state');

	// CSRF + binding: cookie present and unexpired, nonce matches the query param,
	// and the flow belongs to the org/member that is currently authenticated.
	if (!state || !returnedState || returnedState !== state.s) back('invalid_state');
	if (state.o !== auth.orgId || state.m !== auth.member.id) back('invalid_state');
	if (!code) back('invalid_state');
	if (!auth.org.feature_messenger) back('not_enabled');

	let pages: ManagedPage[];
	try {
		const shortToken = await exchangeCodeForUserToken(code);
		const longToken = await exchangeForLongLivedUserToken(shortToken);
		pages = await listManagedPages(longToken);
	} catch (err) {
		logErr(auth, err);
		back('exchange_failed');
	}

	if (pages.length === 0) back('no_pages');

	// Exactly one Page → connect immediately and skip the picker entirely.
	if (pages.length === 1) {
		const result = await connectPage(auth.orgId, auth.member.id, pages[0]);
		if (!result.ok) back(result.reason);
		back('connected');
	}

	// 2+ Pages → stash candidates in the 5-min signed cookie and show the chooser.
	setPendingCookie(event.cookies, auth.orgId, auth.member.id, pages.slice(0, MAX_PICKER_PAGES));
	throw redirect(302, CHOOSE);
};
