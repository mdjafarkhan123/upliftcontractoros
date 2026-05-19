/**
 * Cron — Unsnooze conversations.
 *
 * Schedule: every 5 minutes.
 * Purpose:  Flip conversations whose snoozed_until has passed back to 'open'.
 *           Clears snooze metadata. Bumps updated_at so Realtime subscribers
 *           refresh the inbox row.
 *
 * Idempotent: a status='snoozed' filter + snoozed_until <= now() guard means
 * concurrent runs cannot double-fire.
 */
import { and, eq, isNotNull, lte, sql } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import { conversations } from '$lib/server/db/schema';
import type { CronJobResult } from './index';

export async function runUnsnoozeConversations(): Promise<CronJobResult> {
	const now = new Date();
	const updated = await db
		.update(conversations)
		.set({
			status: 'open',
			snoozed_until: null,
			snoozed_by: null,
			updated_at: now
		})
		.where(
			and(
				eq(conversations.status, 'snoozed'),
				isNotNull(conversations.snoozed_until),
				lte(conversations.snoozed_until, now)
			)
		)
		.returning({ id: conversations.id });

	return {
		processed_count: updated.length,
		affected_count: updated.length,
		scanned_count: updated.length
	};
}
