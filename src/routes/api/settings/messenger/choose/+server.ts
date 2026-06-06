import { json, error } from '@sveltejs/kit';
import { z } from 'zod';
import type { RequestHandler } from './$types';
import { connectPage } from '$lib/server/messenger/connect';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { clearPendingCookie, readPendingCookie } from '$lib/server/messenger/oauthCookies';

const EXPIRED = { error: 'Your connection session expired. Please reconnect.' };

/**
 * Candidate Pages for the multi-page chooser, read from the signed pending
 * cookie set by the callback. Tokens are stripped — only id + name reach the
 * browser. 410 when the cookie is missing/expired so the UI can prompt a retry.
 */
export const GET: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (auth.member.role !== 'admin') error(403, 'Admin only.');

	const pending = readPendingCookie(event.cookies);
	if (!pending || pending.o !== auth.orgId) return json(EXPIRED, { status: 410 });

	return json({ data: { pages: pending.pages.map((p) => ({ id: p.id, name: p.name })) } });
};

const selectSchema = z.object({ page_id: z.string().min(1) }).strict();

/**
 * Connect the Page the contractor picked. The page token comes from the signed
 * cookie (never trusted from the request body), so we only accept a page_id that
 * was in the original candidate set.
 */
export const POST: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (auth.member.role !== 'admin') error(403, 'Admin only.');

	const pending = readPendingCookie(event.cookies);
	if (!pending || pending.o !== auth.orgId) return json(EXPIRED, { status: 410 });

	let body: unknown;
	try {
		body = await event.request.json();
	} catch {
		return json({ error: 'Invalid JSON.' }, { status: 400 });
	}
	const parsed = selectSchema.safeParse(body);
	if (!parsed.success) {
		return json(
			{ error: 'Select a Page to connect.', field_errors: { page_id: 'Required.' } },
			{
				status: 400
			}
		);
	}

	const page = pending.pages.find((p) => p.id === parsed.data.page_id);
	if (!page) {
		return json({ error: 'That Page is no longer available. Please reconnect.' }, { status: 400 });
	}

	const result = await connectPage(auth.orgId, auth.member.id, page);
	if (!result.ok) {
		if (result.reason === 'page_taken') {
			return json(
				{ error: 'That Facebook Page is already connected to another account.' },
				{ status: 409 }
			);
		}
		return json(
			{ error: 'Could not connect that Page to messaging. Please try again.' },
			{
				status: 502
			}
		);
	}

	// Single-use: invalidate the candidate set once a Page is connected.
	clearPendingCookie(event.cookies);
	return json({ data: { connected: true } });
};
