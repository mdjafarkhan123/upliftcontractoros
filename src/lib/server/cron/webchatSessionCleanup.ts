/**
 * Cron — Webchat session cleanup.
 *
 * Schedule: 0 4 * * * (UTC — daily at 4 AM).
 * Purpose:  Find webchat_sessions inactive for 30+ days, close their
 *           associated conversation with closed_reason='webchat_expired',
 *           then hard-delete the stale sessions.
 *
 * IMPORTANT: No "session expired" messages are injected. Conversation
 *            history remains clean. closed_at/closed_reason on the
 *            conversation record is the only signal.
 *
 * Batches in 100-session chunks to avoid long-running transactions.
 * Idempotent: re-runs skip already-closed conversations.
 */
import { and, eq, isNull, lt } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import { conversations, webchatSessions } from '$lib/server/db/schema';
import type { CronJobResult } from './index';

const BATCH_SIZE = 100;
const MAX_BATCHES = 500;
const STALE_DAYS = 30;

export async function runWebchatSessionCleanup(): Promise<CronJobResult> {
	let totalClosed = 0;
	let totalDeleted = 0;
	let errorCount = 0;
	let batches = 0;

	while (batches < MAX_BATCHES) {
		const staleThreshold = new Date(Date.now() - STALE_DAYS * 24 * 60 * 60 * 1000);

		// Find a batch of stale sessions
		const staleSessions = await db
			.select({
				id: webchatSessions.id,
				conversation_id: webchatSessions.conversation_id
			})
			.from(webchatSessions)
			.where(lt(webchatSessions.last_active_at, staleThreshold))
			.limit(BATCH_SIZE);

		if (staleSessions.length === 0) break;

		for (const session of staleSessions) {
			try {
				await db.transaction(async (tx) => {
					// Close the conversation if still open — do NOT inject a message
					await tx
						.update(conversations)
						.set({
							status: 'closed',
							closed_at: new Date(),
							closed_reason: 'webchat_expired',
							updated_at: new Date()
						})
						.where(
							and(
								eq(conversations.id, session.conversation_id),
								eq(conversations.status, 'open'),
								isNull(conversations.deleted_at)
							)
						);

					// Hard-delete the stale session record
					await tx.delete(webchatSessions).where(eq(webchatSessions.id, session.id));
				});
				totalClosed += 1;
				totalDeleted += 1;
			} catch {
				errorCount += 1;
			}
		}

		batches += 1;
		if (staleSessions.length < BATCH_SIZE) break;
	}

	return {
		processed_count: totalClosed,
		affected_count: totalDeleted,
		skipped_count: 0,
		error_count: errorCount,
		scanned_count: totalDeleted
	};
}
