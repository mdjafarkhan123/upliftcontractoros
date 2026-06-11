import { json, error } from '@sveltejs/kit';
import { and, eq, isNotNull } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import {
	contacts,
	opportunities,
	jobs,
	quotes,
	invoices,
	conversations,
	outboxEvents
} from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { isReleasedPhone } from '$lib/utils/phone';

/**
 * Restore a soft-deleted contact out of the recycle bin (and via the
 * new-contact form when a phone duplicate hits a soft-deleted record).
 *
 * `cascadeDeleteContact` stamps the contact and its opportunities/jobs/quotes/
 * invoices/conversations with the SAME deleted_at instant, so we reverse the
 * cascade by clearing deleted_at on children that share the contact's
 * deleted_at — records deleted independently before the contact are left as-is.
 *
 * Requires `can_create_contacts` — restoring is conceptually the same as
 * creating: the contact re-enters active rotation. A RELEASED phone cannot be
 * restored here; that requires the explicit release-phone admin path.
 */
export const POST: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!auth.member.can_create_contacts) error(403, 'Forbidden');

	const [existing] = await db
		.select({
			id: contacts.id,
			phone: contacts.phone,
			deleted_at: contacts.deleted_at,
			assigned_to: contacts.assigned_to
		})
		.from(contacts)
		.where(
			and(
				eq(contacts.org_id, auth.orgId),
				eq(contacts.id, event.params.id),
				isNotNull(contacts.deleted_at)
			)
		)
		.limit(1);

	if (!existing) error(404, 'Contact not found');

	if (isReleasedPhone(existing.phone)) {
		return json(
			{
				error: 'This contact’s phone was released. Create a new contact instead.',
				code: 'PHONE_RELEASED'
			},
			{ status: 422 }
		);
	}

	// Restricted members can only restore contacts that were assigned to them.
	// Mirrors the GET/PATCH/DELETE guard. 404 to avoid leaking existence.
	if (!auth.member.can_view_all_contacts && existing.assigned_to !== auth.member.id) {
		error(404, 'Contact not found');
	}

	// Guaranteed non-null by the isNotNull filter above; narrow for type safety.
	const ts = existing.deleted_at;
	if (ts === null) error(404, 'Contact not found');

	const restored = await db.transaction(async (tx) => {
		// Reverse the cascade: un-delete only the children removed alongside the
		// contact (matching deleted_at), then the contact itself.
		await tx
			.update(opportunities)
			.set({ deleted_at: null })
			.where(
				and(
					eq(opportunities.org_id, auth.orgId),
					eq(opportunities.contact_id, existing.id),
					eq(opportunities.deleted_at, ts)
				)
			);
		await tx
			.update(jobs)
			.set({ deleted_at: null })
			.where(
				and(eq(jobs.org_id, auth.orgId), eq(jobs.contact_id, existing.id), eq(jobs.deleted_at, ts))
			);
		await tx
			.update(quotes)
			.set({ deleted_at: null })
			.where(
				and(
					eq(quotes.org_id, auth.orgId),
					eq(quotes.contact_id, existing.id),
					eq(quotes.deleted_at, ts)
				)
			);
		await tx
			.update(invoices)
			.set({ deleted_at: null })
			.where(
				and(
					eq(invoices.org_id, auth.orgId),
					eq(invoices.contact_id, existing.id),
					eq(invoices.deleted_at, ts)
				)
			);
		await tx
			.update(conversations)
			.set({ deleted_at: null })
			.where(
				and(
					eq(conversations.org_id, auth.orgId),
					eq(conversations.contact_id, existing.id),
					eq(conversations.deleted_at, ts)
				)
			);

		const [row] = await tx
			.update(contacts)
			.set({ deleted_at: null, updated_at: new Date() })
			.where(and(eq(contacts.org_id, auth.orgId), eq(contacts.id, existing.id)))
			.returning();

		await tx.insert(outboxEvents).values({
			org_id: auth.orgId,
			event_type: 'contact.restored',
			resource_type: 'contact',
			resource_id: row.id,
			payload: {
				contact_id: row.id,
				org_id: auth.orgId,
				restored_by: auth.member.id
			},
			idempotency_key: `contact.restored:${row.id}:${Date.now()}`
		});

		return row;
	});

	return json({ contact: restored });
};
