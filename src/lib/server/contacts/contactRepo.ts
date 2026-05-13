import { and, eq, isNull, sql } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import {
	contacts,
	contactAddresses,
	contactNotes,
	orgMembers,
	opportunities,
	jobs,
	quotes,
	invoices,
	conversations
} from '$lib/server/db/schema';
import type { Contact } from '$lib/server/db/schema';

/**
 * Look up an existing contact in this org by E.164 phone.
 * Includes soft-deleted contacts — phone reservations survive soft delete.
 * Excludes "RELEASED:" sentinels because exact equality on the original phone
 * will never match those values.
 */
export async function findContactByPhone(
	orgId: string,
	e164Phone: string
): Promise<Pick<Contact, 'id' | 'deleted_at'> | null> {
	const [row] = await db
		.select({ id: contacts.id, deleted_at: contacts.deleted_at })
		.from(contacts)
		.where(and(eq(contacts.org_id, orgId), eq(contacts.phone, e164Phone)))
		.limit(1);
	return row ?? null;
}

export async function isAssigneeValid(orgId: string, memberId: string): Promise<boolean> {
	const [row] = await db
		.select({ id: orgMembers.id })
		.from(orgMembers)
		.where(
			and(
				eq(orgMembers.org_id, orgId),
				eq(orgMembers.id, memberId),
				eq(orgMembers.is_active, true),
				isNull(orgMembers.deleted_at)
			)
		)
		.limit(1);
	return !!row;
}

export async function listActiveAssignees(
	orgId: string
): Promise<Array<{ id: string; full_name: string }>> {
	return db
		.select({ id: orgMembers.id, full_name: orgMembers.full_name })
		.from(orgMembers)
		.where(
			and(
				eq(orgMembers.org_id, orgId),
				eq(orgMembers.is_active, true),
				isNull(orgMembers.deleted_at)
			)
		)
		.orderBy(orgMembers.full_name);
}

export type ContactLinkCounts = {
	opportunities: number;
	jobs: number;
	quotes: number;
	invoices: number;
	conversations: number;
};

/**
 * Count linked records that block deletion. All counts respect `deleted_at IS NULL`.
 */
export async function countLinkedRecords(
	orgId: string,
	contactId: string
): Promise<ContactLinkCounts> {
	const [row] = await db.execute<{
		opportunities: number;
		jobs: number;
		quotes: number;
		invoices: number;
		conversations: number;
	}>(sql`
		SELECT
			(SELECT COUNT(*)::int FROM ${opportunities}
			 WHERE ${opportunities.contact_id} = ${contactId}
			   AND ${opportunities.org_id} = ${orgId}
			   AND ${opportunities.deleted_at} IS NULL) AS opportunities,
			(SELECT COUNT(*)::int FROM ${jobs}
			 WHERE ${jobs.contact_id} = ${contactId}
			   AND ${jobs.org_id} = ${orgId}
			   AND ${jobs.deleted_at} IS NULL) AS jobs,
			(SELECT COUNT(*)::int FROM ${quotes}
			 WHERE ${quotes.contact_id} = ${contactId}
			   AND ${quotes.org_id} = ${orgId}
			   AND ${quotes.deleted_at} IS NULL) AS quotes,
			(SELECT COUNT(*)::int FROM ${invoices}
			 WHERE ${invoices.contact_id} = ${contactId}
			   AND ${invoices.org_id} = ${orgId}
			   AND ${invoices.deleted_at} IS NULL) AS invoices,
			(SELECT COUNT(*)::int FROM ${conversations}
			 WHERE ${conversations.contact_id} = ${contactId}
			   AND ${conversations.org_id} = ${orgId}
			   AND ${conversations.deleted_at} IS NULL) AS conversations
	`);

	return {
		opportunities: Number(row?.opportunities ?? 0),
		jobs: Number(row?.jobs ?? 0),
		quotes: Number(row?.quotes ?? 0),
		invoices: Number(row?.invoices ?? 0),
		conversations: Number(row?.conversations ?? 0)
	};
}

export function hasAnyLinks(counts: ContactLinkCounts): boolean {
	return (
		counts.opportunities > 0 ||
		counts.jobs > 0 ||
		counts.quotes > 0 ||
		counts.invoices > 0 ||
		counts.conversations > 0
	);
}

export async function loadContactDetail(orgId: string, contactId: string) {
	const [contact] = await db
		.select()
		.from(contacts)
		.where(
			and(
				eq(contacts.org_id, orgId),
				eq(contacts.id, contactId),
				isNull(contacts.deleted_at)
			)
		)
		.limit(1);

	if (!contact) return null;

	const addresses = await db
		.select()
		.from(contactAddresses)
		.where(
			and(
				eq(contactAddresses.contact_id, contactId),
				eq(contactAddresses.org_id, orgId),
				isNull(contactAddresses.deleted_at)
			)
		)
		.orderBy(sql`${contactAddresses.is_primary} DESC, ${contactAddresses.created_at} ASC`);

	const notes = await db
		.select({
			id: contactNotes.id,
			content: contactNotes.content,
			author_id: contactNotes.author_id,
			created_at: contactNotes.created_at,
			author_name: orgMembers.full_name
		})
		.from(contactNotes)
		.leftJoin(orgMembers, eq(orgMembers.id, contactNotes.author_id))
		.where(
			and(
				eq(contactNotes.contact_id, contactId),
				eq(contactNotes.org_id, orgId),
				isNull(contactNotes.deleted_at)
			)
		)
		.orderBy(sql`${contactNotes.created_at} DESC`)
		.limit(10);

	const counts = await countLinkedRecords(orgId, contactId);

	return { contact, addresses, notes, counts };
}
