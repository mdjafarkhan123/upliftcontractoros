/**
 * GET /api/webchat/session/[sessionId]/restore
 * Public — no Supabase auth. Auth via Bearer session_token.
 *
 * Rate limit: 30 req / hour / session_token
 * Returns org config + last 50 messages for re-hydrating the widget after page reload.
 */
import { json } from '@sveltejs/kit';
import { and, asc, eq, isNull } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import {
	conversations,
	messages,
	organizations,
	webchatSessions,
	webchatWidgets
} from '$lib/server/db/schema';
import { validateOrigin } from '$lib/server/webchat/validateOrigin';
import { checkRestoreRateLimit } from '$lib/server/webchat/rateLimit';
import { resolveLogoUrl } from '$lib/server/media/resolveLogo';

const PAGE_SIZE = 50;
const STALE_DAYS = 30;

export const GET: RequestHandler = async ({ request, params }) => {
	const sessionId = params.sessionId;

	// Bearer auth
	const authHeader = request.headers.get('authorization');
	const sessionToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
	if (!sessionToken) return json({ error: 'Unauthorized' }, { status: 401 });

	// Rate limit
	const rateCheck = checkRestoreRateLimit(sessionToken);
	if (!rateCheck.ok) {
		return json(
			{ error: 'Too many requests.' },
			{ status: 429, headers: { 'Retry-After': String(rateCheck.retryAfter) } }
		);
	}

	// Find session
	const [session] = await db
		.select()
		.from(webchatSessions)
		.where(
			and(eq(webchatSessions.id, sessionId), eq(webchatSessions.session_token, sessionToken))
		)
		.limit(1);

	if (!session) return json({ error: 'Session not found' }, { status: 404 });

	// Check stale
	const staleThreshold = new Date(Date.now() - STALE_DAYS * 24 * 60 * 60 * 1000);
	if (session.last_active_at < staleThreshold) {
		return json({ error: 'Session expired' }, { status: 410 });
	}

	// Validate origin
	const [widget] = await db
		.select()
		.from(webchatWidgets)
		.where(eq(webchatWidgets.org_id, session.org_id))
		.limit(1);

	if (!widget || !validateOrigin(request, widget.domain_allowlist)) {
		return json({ error: 'Origin not permitted' }, { status: 403 });
	}

	// Load org info
	const [org] = await db
		.select({
			name: organizations.name,
			logo_url: organizations.logo_url,
			primary_color: organizations.primary_color
		})
		.from(organizations)
		.where(and(eq(organizations.id, session.org_id), isNull(organizations.deleted_at)))
		.limit(1);

	if (!org) return json({ error: 'Organization not found' }, { status: 404 });

	// Load last 50 outbound (contractor) messages — never expose internal notes
	const msgs = await db
		.select({
			id: messages.id,
			body: messages.body,
			sent_at: messages.sent_at
		})
		.from(messages)
		.where(
			and(
				eq(messages.conversation_id, session.conversation_id),
				eq(messages.direction, 'outbound'),
				eq(messages.is_internal_note, false)
			)
		)
		.orderBy(asc(messages.created_at))
		.limit(PAGE_SIZE);

	// Update last_active_at
	await db
		.update(webchatSessions)
		.set({ last_active_at: new Date() })
		.where(eq(webchatSessions.id, session.id));

	return json({
		data: {
			org_name: org.name,
			logo_url: await resolveLogoUrl(org.logo_url),
			primary_color: org.primary_color ?? '#6366f1',
			intro_message:
				widget.intro_message ??
				"We'll text you back — no robocalls, just a real person from our team.",
			offline_message:
				widget.offline_message ??
				"We're currently on site helping customers. Leave your details and we'll reply as soon as possible.",
			webchat_mode: widget.webchat_mode as 'instant' | 'asynchronous',
			messages: msgs.map((m) => ({
				id: m.id,
				body: m.body ?? '',
				sent_at: m.sent_at?.toISOString() ?? new Date().toISOString()
			}))
		}
	});
};
