/**
 * GET /api/webchat/session/[sessionId]/stream
 * SSE endpoint for real-time contractor reply delivery to the widget.
 * Public — no Supabase auth. Auth via ?token query param.
 *
 * Behavior:
 *   - Polls outbound (non-internal) messages every 2s
 *   - Sends heartbeat comment every 15s to keep connections alive through proxies
 *   - Closes after 60s max lifetime; widget auto-reconnects
 *   - Rate limit: 5 concurrent SSE connections per session_token
 */
import { and, asc, eq, gt } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { messages, webchatSessions, webchatWidgets } from '$lib/server/db/schema';
import { validateOrigin } from '$lib/server/webchat/validateOrigin';
import { canOpenSSE, incrementSSE, decrementSSE } from '$lib/server/webchat/rateLimit';

const POLL_INTERVAL_MS = 2000;
const HEARTBEAT_INTERVAL_MS = 15000;
const MAX_LIFETIME_MS = 60000;

export const GET: RequestHandler = async ({ request, params, url }) => {
	const sessionId = params.sessionId;
	const sessionToken = url.searchParams.get('token');

	if (!sessionToken) {
		return new Response('Unauthorized', { status: 401 });
	}

	// Check concurrent SSE limit
	if (!canOpenSSE(sessionToken)) {
		return new Response('Too many connections', { status: 429 });
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

	if (!session) return new Response('Session not found', { status: 404 });

	// Validate origin
	const [widget] = await db
		.select()
		.from(webchatWidgets)
		.where(eq(webchatWidgets.org_id, session.org_id))
		.limit(1);

	if (!widget || !validateOrigin(request, widget.domain_allowlist)) {
		return new Response('Origin not permitted', { status: 403 });
	}

	incrementSSE(sessionToken);

	// Resume cursor from client. Widget persists the latest delivered
	// message's created_at in localStorage and sends it on every (re)connect
	// as ?since=<ISO>. Brand-new connections (no since) default to "now" so
	// we don't replay history that the widget already restored.
	const sinceParam = url.searchParams.get('since');
	const parsedSince = sinceParam ? new Date(sinceParam) : null;
	let lastSeenAt =
		parsedSince && !Number.isNaN(parsedSince.getTime()) ? parsedSince : new Date();

	const stream = new ReadableStream({
		async start(controller) {
			let closed = false;
			let pollTimer: ReturnType<typeof setTimeout> | null = null;
			let heartbeatTimer: ReturnType<typeof setTimeout> | null = null;
			let lifetimeTimer: ReturnType<typeof setTimeout> | null = null;

			function send(data: string) {
				if (closed) return;
				try {
					controller.enqueue(new TextEncoder().encode(data));
				} catch {
					cleanup();
				}
			}

			function cleanup() {
				if (closed) return;
				closed = true;
				if (pollTimer) clearTimeout(pollTimer);
				if (heartbeatTimer) clearInterval(heartbeatTimer);
				if (lifetimeTimer) clearTimeout(lifetimeTimer);
				decrementSSE(sessionToken!);
				try {
					controller.close();
				} catch {
					// Already closed
				}
			}

			async function poll() {
				if (closed) return;
				try {
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
								eq(messages.is_internal_note, false),
								gt(messages.created_at, lastSeenAt)
							)
						)
						.orderBy(asc(messages.created_at))
						.limit(50);

					if (rows.length > 0) {
						// Send in chronological order; advance cursor strictly on
						// created_at — the same column used by the WHERE filter.
						for (const row of rows) {
							const payload = JSON.stringify({
								id: row.id,
								body: row.body ?? '',
								created_at: row.created_at.toISOString(),
								sent_at: row.sent_at?.toISOString() ?? row.created_at.toISOString()
							});
							send(`data: ${payload}\n\n`);
							if (row.created_at > lastSeenAt) lastSeenAt = row.created_at;
						}
					}
				} catch {
					// DB error — skip this poll tick
				}

				if (!closed) {
					pollTimer = setTimeout(() => void poll(), POLL_INTERVAL_MS);
				}
			}

			// Heartbeat keeps SSE connection alive through proxies/load balancers
			heartbeatTimer = setInterval(() => {
				send(': heartbeat\n\n');
			}, HEARTBEAT_INTERVAL_MS);

			// Max lifetime — widget reconnects automatically
			lifetimeTimer = setTimeout(() => {
				send(': close\n\n');
				cleanup();
			}, MAX_LIFETIME_MS);

			// Handle client disconnect
			request.signal.addEventListener('abort', cleanup);

			// Start polling immediately
			await poll();
		}
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			Connection: 'keep-alive',
			'X-Accel-Buffering': 'no'
		}
	});
};
