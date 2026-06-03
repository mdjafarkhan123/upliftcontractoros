import { json, error } from '@sveltejs/kit';
import { and, eq, isNotNull } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { contacts, internalActivityLog, outboxEvents } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { releasePhoneSchema } from '$lib/server/contacts/schemas';
import { buildReleasedPhone, isReleasedPhone } from '$lib/utils/phone';

/**
 * Phone Reservation Override — Admin Role Only.
 *
 * Rule source: Master Domain Architecture v1, contact phone reservation rule
 * (see references/business-rules.md §2).
 *
 * This is the SINGLE permitted runtime read of `org_members.role`. The Roles &
 * Access Matrix has no `can_release_reserved_phone` boolean — releasing a
 * reserved phone is an operational safety action reserved for the organization
 * owner, not a granular CRM permission. Manager/Member are explicitly excluded.
 *
 * Behavior:
 * - Target contact must be soft-deleted (`deleted_at IS NOT NULL`).
 * - The stored `phone` is rewritten in-place to:
 *     RELEASED:<contact_id>:<original_e164>
 *   This immediately frees the `(org_id, phone)` UNIQUE constraint without a
 *   schema migration. The original number is preserved inside the sentinel for
 *   audit. The sentinel never appears in UI, search, or outbound messaging
 *   (enforced by `$lib/utils/phone.ts` and list-route filters).
 * - Emits `contact.phone_released` to `outbox_events` for audit.
 * - Requires an explicit `confirm: true` flag and a free-text `reason`.
 */
export const POST: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);

	if (auth.member.role !== 'admin') {
		error(403, 'Only an Admin can release a reserved phone number.');
	}

	let body: unknown;
	try {
		body = await event.request.json();
	} catch {
		error(400, 'Invalid JSON body');
	}

	const parsed = releasePhoneSchema.safeParse(body);
	if (!parsed.success) {
		return json(
			{
				error:
					parsed.error.issues[0]?.message ?? 'A reason and explicit confirmation are required.',
				code: 'VALIDATION_ERROR'
			},
			{ status: 422 }
		);
	}

	const [target] = await db
		.select()
		.from(contacts)
		.where(
			and(
				eq(contacts.org_id, auth.orgId),
				eq(contacts.id, event.params.id),
				isNotNull(contacts.deleted_at)
			)
		)
		.limit(1);

	if (!target) {
		return json(
			{
				error: 'Phone release is only permitted for soft-deleted contacts.',
				code: 'NOT_RELEASABLE'
			},
			{ status: 409 }
		);
	}

	if (isReleasedPhone(target.phone)) {
		return json(
			{ error: 'This contact phone has already been released.', code: 'ALREADY_RELEASED' },
			{ status: 409 }
		);
	}

	const original = target.phone;
	const released = buildReleasedPhone(target.id, original);

	await db.transaction(async (tx) => {
		await tx
			.update(contacts)
			.set({ phone: released, updated_at: new Date() })
			.where(and(eq(contacts.org_id, auth.orgId), eq(contacts.id, target.id)));

		// Admin audit trail. This is a sensitive owner-only override, so it is
		// recorded in internal_activity_log (the canonical admin audit table)
		// inside the same transaction — not left to the outbox event alone.
		await tx.insert(internalActivityLog).values({
			org_id: auth.orgId,
			author_id: auth.member.id,
			activity_type: 'contact.phone_released',
			title: 'Released reserved phone',
			body: parsed.data.reason,
			metadata: {
				contact_id: target.id,
				original_phone: original,
				released_value: released
			}
		});

		await tx.insert(outboxEvents).values({
			org_id: auth.orgId,
			event_type: 'contact.phone_released',
			resource_type: 'contact',
			resource_id: target.id,
			payload: {
				contact_id: target.id,
				original_phone: original,
				released_value: released,
				released_by_member_id: auth.member.id,
				reason: parsed.data.reason
			},
			idempotency_key: `contact.phone_released:${target.id}:${Date.now()}`
		});
	});

	return json({ ok: true, original_phone: original });
};
