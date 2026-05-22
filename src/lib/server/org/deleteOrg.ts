/**
 * Hard-delete an organization and all owned rows across every domain table.
 *
 * Re-entrant: safe to retry. If the organizations row is already gone,
 * returns immediately. Acquires a transaction-scoped advisory lock keyed on
 * the org_id to prevent concurrent delete attempts overlapping. All DB work
 * happens inside ONE transaction in strict FK-safe child→parent order.
 * R2 object-storage cleanup runs OUTSIDE the transaction and may fail without
 * rolling back the DB delete — the org is already gone at that point.
 */
import { sql } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import { r2DeleteByPrefix } from '$lib/server/media/r2';
import { createLogger } from '$lib/server/log';

const log = createLogger('cron.deleteOrg');

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function deleteFinancialData(tx: Tx, orgId: string): Promise<void> {
	await tx.execute(sql`DELETE FROM payments WHERE org_id = ${orgId}`);
	await tx.execute(sql`DELETE FROM invoice_views WHERE org_id = ${orgId}`);
	await tx.execute(sql`DELETE FROM invoice_line_items WHERE org_id = ${orgId}`);
	await tx.execute(sql`DELETE FROM invoices WHERE org_id = ${orgId}`);
	await tx.execute(sql`DELETE FROM quote_views WHERE org_id = ${orgId}`);
	await tx.execute(sql`DELETE FROM quote_line_items WHERE org_id = ${orgId}`);
	await tx.execute(sql`DELETE FROM quotes WHERE org_id = ${orgId}`);
	await tx.execute(sql`DELETE FROM quote_template_line_items WHERE org_id = ${orgId}`);
	await tx.execute(sql`DELETE FROM quote_templates WHERE org_id = ${orgId}`);
}

async function deleteMediaData(tx: Tx, orgId: string): Promise<void> {
	// media must come before jobs/quotes/invoices, but invoices/quotes are already gone
	// by the time this runs — still required before jobs.
	await tx.execute(sql`DELETE FROM media WHERE org_id = ${orgId}`);
}

async function deleteCommunicationData(tx: Tx, orgId: string): Promise<void> {
	await tx.execute(sql`DELETE FROM messages WHERE org_id = ${orgId}`);
	await tx.execute(sql`DELETE FROM conversations WHERE org_id = ${orgId}`);
}

async function deleteAppointmentsData(tx: Tx, orgId: string): Promise<void> {
	// appointments.booked_via_link_id → booking_links(id). Appointments must
	// be deleted before booking_links to satisfy the FK. availability_windows
	// and availability_overrides cascade automatically via ON DELETE CASCADE
	// from booking_links — no explicit step needed for those.
	await tx.execute(sql`DELETE FROM appointments WHERE org_id = ${orgId}`);
	await tx.execute(sql`DELETE FROM booking_links WHERE org_id = ${orgId}`);
}

async function deleteReputationData(tx: Tx, orgId: string): Promise<void> {
	await tx.execute(sql`DELETE FROM reviews WHERE org_id = ${orgId}`);
	await tx.execute(sql`DELETE FROM private_feedback WHERE org_id = ${orgId}`);
	await tx.execute(sql`DELETE FROM review_requests WHERE org_id = ${orgId}`);
}

async function deleteJobsAndPipelineData(tx: Tx, orgId: string): Promise<void> {
	await tx.execute(sql`DELETE FROM jobs WHERE org_id = ${orgId}`);
	await tx.execute(sql`DELETE FROM opportunities WHERE org_id = ${orgId}`);
	await tx.execute(sql`DELETE FROM pipeline_stages WHERE org_id = ${orgId}`);
}

async function deleteContactData(tx: Tx, orgId: string): Promise<void> {
	await tx.execute(sql`DELETE FROM contact_notes WHERE org_id = ${orgId}`);
	await tx.execute(sql`DELETE FROM contact_addresses WHERE org_id = ${orgId}`);
	await tx.execute(sql`DELETE FROM contacts WHERE org_id = ${orgId}`);
}

async function deleteSystemData(tx: Tx, orgId: string): Promise<void> {
	await tx.execute(sql`DELETE FROM notifications WHERE org_id = ${orgId}`);
	await tx.execute(sql`DELETE FROM automation_jobs WHERE org_id = ${orgId}`);
	await tx.execute(sql`DELETE FROM internal_activity_log WHERE org_id = ${orgId}`);
	await tx.execute(sql`DELETE FROM growth_feed_items WHERE org_id = ${orgId}`);
	await tx.execute(sql`DELETE FROM automation_settings WHERE org_id = ${orgId}`);
	await tx.execute(sql`DELETE FROM org_counters WHERE org_id = ${orgId}`);
	await tx.execute(sql`DELETE FROM outbox_events WHERE org_id = ${orgId}`);
}

async function deleteOrganizationShell(tx: Tx, orgId: string): Promise<void> {
	// organizations.feature_flags_updated_by references org_members.id — null it before
	// removing members so the FK does not block deletion.
	await tx.execute(
		sql`UPDATE organizations SET feature_flags_updated_by = NULL WHERE id = ${orgId}`
	);
	await tx.execute(sql`DELETE FROM org_members WHERE org_id = ${orgId}`);
	await tx.execute(sql`DELETE FROM organizations WHERE id = ${orgId}`);
}

export async function deleteOrg(orgId: string): Promise<void> {
	const startedAt = Date.now();
	let dbDeleted = false;

	try {
		await db.transaction(async (tx) => {
			// Concurrency guard — second concurrent attempt for the same org blocks
			// here until the holder commits, then sees an already-gone org and returns.
			await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${orgId}))`);

			const existing = await tx.execute<{ id: string }>(
				sql`SELECT id FROM organizations WHERE id = ${orgId} LIMIT 1`
			);
			if ((existing as unknown as { id: string }[]).length === 0) {
				log.info({ org_id: orgId, reason: 'already_deleted' });
				return;
			}

			// Drop pending dispatch records first — the org is being permanently
			// hard-deleted and preserving them adds no value while introducing
			// worker race conditions with the FK deletes below.
			await tx.execute(
				sql`DELETE FROM outbox_events WHERE org_id = ${orgId} AND status IN ('pending', 'processing')`
			);

			await deleteFinancialData(tx, orgId);
			await deleteMediaData(tx, orgId);
			await deleteCommunicationData(tx, orgId);
			await deleteAppointmentsData(tx, orgId);
			await deleteReputationData(tx, orgId);
			await deleteJobsAndPipelineData(tx, orgId);
			await deleteContactData(tx, orgId);
			await deleteSystemData(tx, orgId);
			await deleteOrganizationShell(tx, orgId);

			dbDeleted = true;
		});
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		log.error({
			org_id: orgId,
			phase: 'db_transaction',
			error: message,
			duration_ms: Date.now() - startedAt
		});
		throw err;
	}

	if (!dbDeleted) return;

	try {
		const count = await r2DeleteByPrefix(`${orgId}/`);
		log.info({
			org_id: orgId,
			phase: 'r2_cleanup',
			objects_deleted: count,
			duration_ms: Date.now() - startedAt
		});
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		log.warn({
			org_id: orgId,
			phase: 'r2_cleanup',
			reason: 'r2_failure',
			error: message,
			note: 'db_delete_already_committed'
		});
	}
}
