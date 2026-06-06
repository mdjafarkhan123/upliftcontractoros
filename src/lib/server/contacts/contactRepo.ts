import { and, eq, inArray, isNotNull, isNull, ne, sql } from 'drizzle-orm';
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
	conversations,
	outboxEvents
} from '$lib/server/db/schema';
import { isReleasedPhone } from '$lib/utils/phone';
import type { Contact } from '$lib/server/db/schema';

/**
 * Look up an existing contact in this org by E.164 phone.
 * Includes soft-deleted contacts — phone reservations survive soft delete.
 * Excludes "RELEASED:" sentinels because exact equality on the original phone
 * will never match those values. Phoneless contacts (NULL phone, e.g. Messenger
 * leads) are explicitly excluded — they have no phone dedup identity.
 */
export async function findContactByPhone(
	orgId: string,
	e164Phone: string
): Promise<Pick<Contact, 'id' | 'deleted_at'> | null> {
	const [row] = await db
		.select({ id: contacts.id, deleted_at: contacts.deleted_at })
		.from(contacts)
		.where(
			and(eq(contacts.org_id, orgId), isNotNull(contacts.phone), eq(contacts.phone, e164Phone))
		)
		.limit(1);
	return row ?? null;
}

export async function isReferrerValid(
	orgId: string,
	referrerId: string,
	excludeContactId?: string
): Promise<boolean> {
	const [row] = await db
		.select({ id: contacts.id })
		.from(contacts)
		.where(
			and(eq(contacts.org_id, orgId), eq(contacts.id, referrerId), isNull(contacts.deleted_at))
		)
		.limit(1);
	if (!row) return false;
	if (excludeContactId && row.id === excludeContactId) return false;
	return true;
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
	const [row] = await db
		.select({
			contact: contacts,
			assignee_id: orgMembers.id,
			assignee_name: orgMembers.full_name
		})
		.from(contacts)
		.leftJoin(orgMembers, eq(orgMembers.id, contacts.assigned_to))
		.where(and(eq(contacts.org_id, orgId), eq(contacts.id, contactId), isNull(contacts.deleted_at)))
		.limit(1);

	if (!row) return null;
	const contact = row.contact;
	const assignee =
		row.assignee_id && row.assignee_name ? { id: row.assignee_id, name: row.assignee_name } : null;

	let referrer: { id: string; name: string } | null = null;
	if (contact.referred_by_contact_id) {
		const [ref] = await db
			.select({ id: contacts.id, full_name: contacts.full_name, deleted_at: contacts.deleted_at })
			.from(contacts)
			.where(and(eq(contacts.org_id, orgId), eq(contacts.id, contact.referred_by_contact_id)))
			.limit(1);
		if (ref) {
			referrer = {
				id: ref.id,
				name: ref.deleted_at ? `${ref.full_name} (Deleted)` : ref.full_name
			};
		}
	}

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

	const [referralCount] = await db.execute<{ count: number }>(sql`
		SELECT COUNT(*)::int AS count FROM ${contacts}
		WHERE ${contacts.org_id} = ${orgId}
			AND ${contacts.referred_by_contact_id} = ${contactId}
			AND ${contacts.deleted_at} IS NULL
	`);

	return {
		contact,
		assignee,
		referrer,
		referral_count: Number(referralCount?.count ?? 0),
		addresses,
		notes,
		counts
	};
}

// ---------------------------------------------------------------------------
// Merge duplicates
// ---------------------------------------------------------------------------

// Tables that carry contact_id and must be re-pointed at the survivor. Plain
// reparent (contact_id only). Collision-prone tables (conversations,
// contact_addresses) are handled separately BEFORE this list runs.
const REPARENT_TABLES = [
	'contact_notes',
	'opportunities',
	'jobs',
	'quotes',
	'invoices',
	'appointments',
	'review_requests',
	'reviews',
	'private_feedback',
	'media',
	'activity_events',
	'webchat_sessions'
] as const;

function dedupe(values: string[]): string[] {
	return Array.from(new Set(values));
}

function earliest(dates: Array<Date | null>): Date | null {
	const present = dates.filter((d): d is Date => d !== null);
	if (present.length === 0) return null;
	return present.reduce((a, b) => (a.getTime() <= b.getTime() ? a : b));
}

function latest(dates: Array<Date | null>): Date | null {
	const present = dates.filter((d): d is Date => d !== null);
	if (present.length === 0) return null;
	return present.reduce((a, b) => (a.getTime() >= b.getTime() ? a : b));
}

export type MergeResult =
	| { ok: true; survivor: Contact }
	| { ok: false; code: 'NOT_FOUND' | 'SAME_CONTACT' };

/**
 * Merge `sourceId` into `survivorId`. Reparents every linked record across the
 * contact graph onto the survivor, folds non-conflicting fields, preserves the
 * source's distinct phone as `alt_phone`, writes an audit note + outbox event,
 * then soft-deletes the source. All inside one transaction.
 *
 * Field resolution (auto-merge): survivor keeps name/phone/assignee; email and
 * alt_phone fill from the source only when the survivor's is empty; tags union;
 * status escalates to `customer` if either side is a customer; SMS opt-out is
 * sticky (never silently re-enabled — TCPA). The source's free-text notes and
 * phone are preserved in the audit note.
 */
export async function mergeContacts(
	orgId: string,
	survivorId: string,
	sourceId: string,
	actorMemberId: string
): Promise<MergeResult> {
	if (survivorId === sourceId) return { ok: false, code: 'SAME_CONTACT' };

	return db.transaction(async (tx) => {
		// Lock both rows in a deterministic order (by id) to avoid deadlocks
		// between concurrent merges touching the same pair.
		const rows = await tx
			.select()
			.from(contacts)
			.where(
				and(
					eq(contacts.org_id, orgId),
					inArray(contacts.id, [survivorId, sourceId]),
					isNull(contacts.deleted_at)
				)
			)
			.orderBy(contacts.id)
			.for('update');

		const survivor = rows.find((r) => r.id === survivorId);
		const source = rows.find((r) => r.id === sourceId);
		if (!survivor || !source) return { ok: false, code: 'NOT_FOUND' as const };

		// --- Collision pre-steps (must run before reparenting) ---

		// One open conversation per (contact, channel). For any channel where the
		// survivor already has an open conversation, close the source's open one so
		// the partial unique index does not fire on reparent. History is preserved.
		await tx.execute(sql`
			UPDATE conversations SET status = 'closed', updated_at = now()
			WHERE org_id = ${orgId} AND contact_id = ${sourceId}
			  AND deleted_at IS NULL AND status = 'open'
			  AND channel IN (
			    SELECT channel FROM conversations
			    WHERE org_id = ${orgId} AND contact_id = ${survivorId}
			      AND deleted_at IS NULL AND status = 'open'
			  )
		`);

		// One primary address per contact. If the survivor already has an active
		// primary, demote the source's primaries before reparenting.
		await tx.execute(sql`
			UPDATE contact_addresses SET is_primary = false, updated_at = now()
			WHERE org_id = ${orgId} AND contact_id = ${sourceId}
			  AND is_primary = true AND deleted_at IS NULL
			  AND EXISTS (
			    SELECT 1 FROM contact_addresses
			    WHERE org_id = ${orgId} AND contact_id = ${survivorId}
			      AND is_primary = true AND deleted_at IS NULL
			  )
		`);

		// --- Reparent collision-prone tables, then everything else ---
		await tx.execute(sql`
			UPDATE conversations SET contact_id = ${survivorId}
			WHERE org_id = ${orgId} AND contact_id = ${sourceId}
		`);
		await tx.execute(sql`
			UPDATE contact_addresses SET contact_id = ${survivorId}
			WHERE org_id = ${orgId} AND contact_id = ${sourceId}
		`);
		for (const table of REPARENT_TABLES) {
			await tx.execute(
				sql`UPDATE ${sql.raw(table)} SET contact_id = ${survivorId} WHERE org_id = ${orgId} AND contact_id = ${sourceId}`
			);
		}

		// Rewrite referral pointers from other contacts that were referred by the
		// source. Exclude the survivor/source themselves to avoid self-reference.
		await tx
			.update(contacts)
			.set({ referred_by_contact_id: survivorId, updated_at: new Date() })
			.where(
				and(
					eq(contacts.org_id, orgId),
					eq(contacts.referred_by_contact_id, sourceId),
					ne(contacts.id, survivorId),
					ne(contacts.id, sourceId)
				)
			);

		// --- Fold fields onto the survivor ---
		const sourcePhoneUsable = !isReleasedPhone(source.phone) && source.phone !== survivor.phone;
		const altPhone = survivor.alt_phone ?? (sourcePhoneUsable ? source.phone : null);
		const altPhoneOverflow = sourcePhoneUsable && survivor.alt_phone !== null;

		const finalStatus =
			survivor.status === 'customer' || source.status === 'customer' ? 'customer' : survivor.status;
		const convertedAt =
			earliest([survivor.converted_at, source.converted_at]) ??
			(finalStatus === 'customer' ? new Date() : null);

		const optOut = survivor.sms_opt_out || source.sms_opt_out;
		const optOutMeta =
			optOut && !survivor.sms_opt_out
				? {
						sms_opt_out_at: source.sms_opt_out_at ?? new Date(),
						sms_opt_out_source: source.sms_opt_out_source ?? 'merge'
					}
				: {
						sms_opt_out_at: survivor.sms_opt_out_at,
						sms_opt_out_source: survivor.sms_opt_out_source
					};

		const survivorRefersToSource = survivor.referred_by_contact_id === sourceId;

		// Audit note — preserves the source's name, phone, and free-text notes.
		const noteParts = [
			`Merged duplicate "${source.full_name}" into this contact.`,
			`Merged record phone: ${isReleasedPhone(source.phone) ? '(released)' : source.phone}.`
		];
		if (altPhoneOverflow) {
			noteParts.push(
				`This contact already had a secondary phone, so the merged number above was kept here for reference only.`
			);
		}
		if (source.notes && source.notes.trim().length > 0) {
			noteParts.push(`Notes from merged record:\n${source.notes.trim()}`);
		}
		await tx.insert(contactNotes).values({
			org_id: orgId,
			contact_id: survivorId,
			author_id: actorMemberId,
			content: noteParts.join('\n\n')
		});

		const [updatedSurvivor] = await tx
			.update(contacts)
			.set({
				email: survivor.email ?? source.email,
				alt_phone: altPhone,
				tags: dedupe([...survivor.tags, ...source.tags]),
				status: finalStatus,
				converted_at: convertedAt,
				next_follow_up_at: earliest([survivor.next_follow_up_at, source.next_follow_up_at]),
				last_contacted_at: latest([survivor.last_contacted_at, source.last_contacted_at]),
				sms_opt_out: optOut,
				sms_opt_out_at: optOutMeta.sms_opt_out_at,
				sms_opt_out_source: optOutMeta.sms_opt_out_source,
				referred_by_contact_id: survivorRefersToSource ? null : survivor.referred_by_contact_id,
				updated_at: new Date()
			})
			.where(and(eq(contacts.org_id, orgId), eq(contacts.id, survivorId)))
			.returning();

		// Soft-delete the source. Phone stays reserved on the row (U9). Clear its
		// follow-up so the due-sweep never targets a merged-away contact.
		await tx
			.update(contacts)
			.set({ deleted_at: new Date(), next_follow_up_at: null, updated_at: new Date() })
			.where(and(eq(contacts.org_id, orgId), eq(contacts.id, sourceId)));

		await tx.insert(outboxEvents).values({
			org_id: orgId,
			event_type: 'contact.merged',
			resource_type: 'contact',
			resource_id: survivorId,
			payload: {
				contact_id: survivorId,
				org_id: orgId,
				survivor_id: survivorId,
				source_id: sourceId,
				source_full_name: source.full_name,
				source_phone: isReleasedPhone(source.phone) ? null : source.phone,
				merged_by: actorMemberId
			},
			idempotency_key: `contact.merged:${survivorId}:${sourceId}`
		});

		return { ok: true as const, survivor: updatedSurvivor };
	});
}

// ---------------------------------------------------------------------------
// Bulk list actions
// ---------------------------------------------------------------------------

/** ids (from the given set) that have at least one live linked record. */
async function findContactIdsWithLinks(orgId: string, ids: string[]): Promise<Set<string>> {
	if (ids.length === 0) return new Set();
	const rows = await db.execute<{ id: string }>(sql`
		SELECT c.id FROM contacts c
		WHERE c.org_id = ${orgId} AND c.id = ANY(${ids}::uuid[]) AND (
			EXISTS (SELECT 1 FROM opportunities o WHERE o.contact_id = c.id AND o.org_id = ${orgId} AND o.deleted_at IS NULL)
			OR EXISTS (SELECT 1 FROM jobs j WHERE j.contact_id = c.id AND j.org_id = ${orgId} AND j.deleted_at IS NULL)
			OR EXISTS (SELECT 1 FROM quotes q WHERE q.contact_id = c.id AND q.org_id = ${orgId} AND q.deleted_at IS NULL)
			OR EXISTS (SELECT 1 FROM invoices i WHERE i.contact_id = c.id AND i.org_id = ${orgId} AND i.deleted_at IS NULL)
			OR EXISTS (SELECT 1 FROM conversations cv WHERE cv.contact_id = c.id AND cv.org_id = ${orgId} AND cv.deleted_at IS NULL)
		)
	`);
	return new Set((rows as unknown as Array<{ id: string }>).map((r) => r.id));
}

function scopeClause(orgId: string, ids: string[], restrictToMemberId: string | null) {
	const base = [eq(contacts.org_id, orgId), inArray(contacts.id, ids), isNull(contacts.deleted_at)];
	if (restrictToMemberId) base.push(eq(contacts.assigned_to, restrictToMemberId));
	return and(...base);
}

export async function bulkAssignContacts(
	orgId: string,
	ids: string[],
	assignedTo: string | null,
	restrictToMemberId: string | null
): Promise<number> {
	const updated = await db
		.update(contacts)
		.set({ assigned_to: assignedTo, updated_at: new Date() })
		.where(scopeClause(orgId, ids, restrictToMemberId))
		.returning({ id: contacts.id });
	return updated.length;
}

export async function bulkAddTags(
	orgId: string,
	ids: string[],
	tags: string[],
	restrictToMemberId: string | null
): Promise<number> {
	const rows = await db.execute<{ id: string }>(sql`
		UPDATE contacts
		SET tags = (SELECT COALESCE(array_agg(DISTINCT x), '{}') FROM unnest(tags || ${tags}::text[]) AS x),
		    updated_at = now()
		WHERE org_id = ${orgId} AND id = ANY(${ids}::uuid[]) AND deleted_at IS NULL
		${restrictToMemberId ? sql`AND assigned_to = ${restrictToMemberId}` : sql``}
		RETURNING id
	`);
	return (rows as unknown as Array<{ id: string }>).length;
}

export async function bulkRemoveTags(
	orgId: string,
	ids: string[],
	tags: string[],
	restrictToMemberId: string | null
): Promise<number> {
	const rows = await db.execute<{ id: string }>(sql`
		UPDATE contacts
		SET tags = ARRAY(SELECT x FROM unnest(tags) AS x WHERE NOT (x = ANY(${tags}::text[]))),
		    updated_at = now()
		WHERE org_id = ${orgId} AND id = ANY(${ids}::uuid[]) AND deleted_at IS NULL
		${restrictToMemberId ? sql`AND assigned_to = ${restrictToMemberId}` : sql``}
		RETURNING id
	`);
	return (rows as unknown as Array<{ id: string }>).length;
}

export type BulkArchiveResult = {
	archived: number;
	skipped: Array<{ id: string; full_name: string }>;
};

export async function bulkArchiveContacts(
	orgId: string,
	ids: string[],
	restrictToMemberId: string | null
): Promise<BulkArchiveResult> {
	// Candidates: in scope, not already archived.
	const candidates = await db
		.select({ id: contacts.id, full_name: contacts.full_name })
		.from(contacts)
		.where(and(scopeClause(orgId, ids, restrictToMemberId), ne(contacts.status, 'archived')));

	if (candidates.length === 0) return { archived: 0, skipped: [] };

	const candidateIds = candidates.map((c) => c.id);
	const blocked = await findContactIdsWithLinks(orgId, candidateIds);
	const archivableIds = candidateIds.filter((id) => !blocked.has(id));

	if (archivableIds.length > 0) {
		await db
			.update(contacts)
			.set({ status: 'archived', updated_at: new Date() })
			.where(and(eq(contacts.org_id, orgId), inArray(contacts.id, archivableIds)));
	}

	return {
		archived: archivableIds.length,
		skipped: candidates.filter((c) => blocked.has(c.id))
	};
}
