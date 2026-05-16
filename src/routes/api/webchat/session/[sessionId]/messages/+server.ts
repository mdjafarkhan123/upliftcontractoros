/**
 * POST /api/webchat/session/[sessionId]/messages
 * Public — no Supabase auth. Auth via Bearer session_token.
 *
 * Rate limit: 60 req / hour / session_token
 * Sessions expire after 30 days of inactivity.
 */
import { json } from '@sveltejs/kit';
import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import {
	conversations,
	messages,
	outboxEvents,
	webchatSessions,
	webchatWidgets
} from '$lib/server/db/schema';
import { validateOrigin } from '$lib/server/webchat/validateOrigin';
import { checkMessageRateLimit } from '$lib/server/webchat/rateLimit';
import { sanitizeMessageBody } from '$lib/server/webchat/sanitize';

const STALE_DAYS = 30;

const bodySchema = z.object({
	body: z.string().min(1, 'Message is required').max(2000, 'Message too long')
});

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

	const result = await db.transaction(async (tx) => {
		const [inserted] = await tx
			.insert(messages)
			.values({
				org_id: session.org_id,
				conversation_id: session.conversation_id,
				direction: 'inbound',
				channel: 'webchat',
				body: sanitized,
				is_internal_note: false,
				status: 'received',
				sent_by: null,
				sent_at: now
			})
			.returning();

		await tx
			.update(conversations)
			.set({
				unread_count: sql`${conversations.unread_count} + 1`,
				last_message_at: now,
				updated_at: now
			})
			.where(eq(conversations.id, session.conversation_id));

		await tx
			.update(webchatSessions)
			.set({ last_active_at: now })
			.where(eq(webchatSessions.id, session.id));

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
