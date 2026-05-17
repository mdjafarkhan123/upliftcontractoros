import { and, eq, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import { contacts } from '$lib/server/db/schema';
import { createLogger } from '$lib/server/log';

const log = createLogger('contacts.last_contacted_at');

/**
 * Best-effort bump of `contacts.last_contacted_at` after a successful
 * communication event (outbound SMS, inbound SMS, missed call). Never throws;
 * failures are logged and swallowed so the communication flow is not impacted.
 *
 * Scoped by org_id and excludes soft-deleted contacts.
 */
export async function touchContactLastContacted(orgId: string, contactId: string): Promise<void> {
	try {
		await db
			.update(contacts)
			.set({ last_contacted_at: new Date() })
			.where(
				and(
					eq(contacts.org_id, orgId),
					eq(contacts.id, contactId),
					isNull(contacts.deleted_at)
				)
			);
	} catch (err) {
		log.warn({
			phase: 'update_failed',
			org_id: orgId,
			contact_id: contactId,
			error: err instanceof Error ? err.message : String(err)
		});
	}
}
