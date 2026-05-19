/**
 * POST /api/webchat/session/[sessionId]/messages
 * Public — no Supabase auth. Auth via Bearer session_token.
 *
 * Rate limit: 60 req / hour / session_token
 * Sessions expire after 30 days of inactivity.
 */
import { json } from '@sveltejs/kit';
import { and, asc, eq, gt } from 'drizzle-orm';
import { z } from 'zod';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import {
	inboundCommunicationEvents,
	messages,
	outboxEvents,
	webchatSessions,
	webchatWidgets
} from '$lib/server/db/schema';
import { recordInboundMessage } from '$lib/server/conversations';
import { validateOrigin } from '$lib/server/webchat/validateOrigin';
import { checkMessageRateLimit, checkPollRateLimit } from '$lib/server/webchat/rateLimit';
import { sanitizeMessageBody } from '$lib/server/webchat/sanitize';
import { createLogger } from '$lib/server/log';

const log = createLogger('webchat.message.insert');

const STALE_DAYS = 30;

const bodySchema = z.object({
	body: z.string().min(1, 'Message is required').max(2000, 'Message too long')
});

const POLL_PAGE_SIZE = 50;

/**
 * GET /api/webchat/session/[sessionId]/messages?since=<ISO>
 * Public — Bearer session_token. Returns outbound (contractor → visitor)
 * messages newer than `since`, in chronological order. Used by the widget's
 * 3-second polling loop in place of SSE (which is unreliable on Vercel
 * serverless). Internal notes are excluded.
 */
export const GET: RequestHandler = async ({ request, params, url }) => {
	const sessionId = params.sessionId;

	const authHeader = request.headers.get('authorization');
	const sessionToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
	if (!sessionToken) return json({ error: 'Unauthorized' }, { status: 401 });

	const rateCheck = checkPollRateLimit(sessionToken);
	if (!rateCheck.ok) {
		return json(
			{ error: 'Too many requests.' },
			{ status: 429, headers: { 'Retry-After': String(rateCheck.retryAfter) } }
		);
	}

	const [session] = await db
		.select()
		.from(webchatSessions)
		.where(
			and(
				eq(webchatSessions.id, sessionId),
				eq(webchatSessions.session_token, sessionToken)
			)
		)
		.limit(1);

	if (!session) return json({ error: 'Session not found' }, { status: 404 });

	const staleThreshold = new Date(Date.now() - STALE_DAYS * 24 * 60 * 60 * 1000);
	if (session.last_active_at < staleThreshold) {
		return json({ error: 'Session expired' }, { status: 410 });
	}

	const [widget] = await db
		.select()
		.from(webchatWidgets)
		.where(eq(webchatWidgets.org_id, session.org_id))
		.limit(1);

	if (!widget || !validateOrigin(request, widget.domain_allowlist)) {
		return json({ error: 'Origin not permitted' }, { status: 403 });
	}

	const sinceParam = url.searchParams.get('since');
	const parsedSince = sinceParam ? new Date(sinceParam) : null;
	const since =
		parsedSince && !Number.isNaN(parsedSince.getTime()) ? parsedSince : new Date(0);

	const rows = await db
		.select({
			id: messages.id,
			body: messages.body,
			sent_at: messages.sent_at,
			created_at: messages.created_at
		})
		.from(messages)
		.where(
			and(
				eq(messages.conversation_id, session.conversation_id),
				eq(messages.direction, 'outbound'),
				eq(messages.channel, 'webchat'),
				eq(messages.is_internal_note, false),
				gt(messages.created_at, since)
			)
		)
		.orderBy(asc(messages.created_at))
		.limit(POLL_PAGE_SIZE);

	return json({
		data: {
			messages: rows.map((r) => ({
				id: r.id,
				body: r.body ?? '',
				created_at: r.created_at.toISOString(),
				sent_at: r.sent_at?.toISOString() ?? r.created_at.toISOString()
			}))
		}
	});
};

export const POST: RequestHandler = async ({ request, params }) => {
	const sessionId = params.sessionId;

	// Bearer auth
	const authHeader = request.headers.get('authorization');
	const sessionToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
	if (!sessionToken) return json({ error: 'Unauthorized' }, { status: 401 });

	// Rate limit
	const rateCheck = checkMessageRateLimit(sessionToken);
	if (!rateCheck.ok) {
		return json(
			{ error: 'Too many requests.' },
			{ status: 429, headers: { 'Retry-After': String(rateCheck.retryAfter) } }
		);
	}

	// Find and validate session
	const [session] = await db
		.select()
		.from(webchatSessions)
		.where(
			and(
				eq(webchatSessions.id, sessionId),
				eq(webchatSessions.session_token, sessionToken)
			)
		)
		.limit(1);

	if (!session) return json({ error: 'Session not found' }, { status: 404 });

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

	// Parse body
	let parsed: z.infer<typeof bodySchema>;
	try {
		const raw = await request.json();
		const result = bodySchema.safeParse(raw);
		if (!result.success) {
			const issue = result.error.issues[0];
			return json(
				{ error: issue?.message ?? 'Invalid input', field_errors: { body: issue?.message } },
				{ status: 400 }
			);
		}
		parsed = result.data;
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	const sanitized = sanitizeMessageBody(parsed.body);
	if (!sanitized) {
		return json({ error: 'Message body is empty after sanitization' }, { status: 400 });
	}

	const now = new Date();
	const txStart = Date.now();

	let result;
	try {
		result = await db.transaction(async (tx) => {
			const inserted = await recordInboundMessage(tx, {
				orgId: session.org_id,
				conversationId: session.conversation_id,
				channel: 'webchat',
				body: sanitized,
				source: 'webchat',
				sentAt: now
			});

			await tx
				.update(webchatSessions)
				.set({ last_active_at: now })
				.where(eq(webchatSessions.id, session.id));

			await tx.insert(inboundCommunicationEvents).values({
				org_id: session.org_id,
				provider: 'webchat',
				provider_event_id: inserted.id,
				event_type: 'webchat',
				raw_payload: { body: sanitized, session_id: session.id },
				processed_at: now
			});

			await tx.insert(outboxEvents).values({
				org_id: session.org_id,
				event_type: 'message.received',
				resource_type: 'message',
				resource_id: inserted.id,
				payload: {
					message_id: inserted.id,
					conversation_id: session.conversation_id,
					contact_id: session.contact_id,
					org_id: session.org_id,
					channel: 'webchat',
					body: sanitized
				},
				idempotency_key: `message.received:${inserted.id}`
			});

			return inserted;
		});
	} catch (e) {
		log.error({
			phase: 'tx_error',
			conversation_id: session.conversation_id,
			org_id: session.org_id,
			ms: Date.now() - txStart,
			error: e instanceof Error ? e.message : String(e),
			stack: e instanceof Error ? e.stack : undefined
		});
		return json({ error: 'Failed to persist message' }, { status: 500 });
	}

	return json(
		{
			data: {
				message_id: result.id,
				sent_at: result.sent_at?.toISOString() ?? now.toISOString()
			}
		},
		{ status: 201 }
	);
};
