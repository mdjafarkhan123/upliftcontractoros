import { json, error } from '@sveltejs/kit';
import { and, eq, isNull } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { appointments, requestLineItems, requests } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { canManageRequests, canViewRequests } from '$lib/server/requests/permissions';
import { updateRequestSchema } from '$lib/server/requests/schemas';
import { toLineItemValues } from '$lib/server/requests/lineItems';
import { loadRequestDetail } from '$lib/server/requests/detail';

export const GET: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!canViewRequests(auth.member)) error(403, 'Forbidden');

	const detail = await loadRequestDetail(
		auth.orgId,
		event.params.id,
		auth.org.timezone || 'America/Chicago'
	);
	if (!detail) return json({ error: 'Request not found' }, { status: 404 });

	return json({ data: detail });
};

export const PATCH: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!canManageRequests(auth.member)) error(403, 'Forbidden');

	let body: unknown;
	try {
		body = await event.request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	const parsed = updateRequestSchema.safeParse(body);
	if (!parsed.success) {
		const field_errors: Record<string, string> = {};
		for (const issue of parsed.error.issues) {
			const path = issue.path.join('.');
			if (path && !field_errors[path]) field_errors[path] = issue.message;
		}
		return json(
			{ error: parsed.error.issues[0]?.message ?? 'Invalid input', field_errors },
			{ status: 422 }
		);
	}
	const input = parsed.data;

	const [existing] = await db
		.select({ id: requests.id, converted_at: requests.converted_at })
		.from(requests)
		.where(
			and(
				eq(requests.id, event.params.id),
				eq(requests.org_id, auth.orgId),
				isNull(requests.deleted_at)
			)
		)
		.limit(1);
	if (!existing) return json({ error: 'Request not found' }, { status: 404 });
	// Converted is TERMINAL (Jobber rule): the record is frozen history from the
	// moment it produces a quote/job.
	if (existing.converted_at) {
		return json(
			{ error: 'This request has been converted and can no longer be edited.' },
			{
				status: 409
			}
		);
	}

	await db.transaction(async (tx) => {
		const updates: Partial<typeof requests.$inferInsert> = { updated_at: new Date() };
		if (input.title !== undefined) updates.title = input.title;
		if (input.service_details !== undefined) updates.service_details = input.service_details;
		if (input.lead_source_answer !== undefined)
			updates.lead_source_answer = input.lead_source_answer;
		if (input.notes !== undefined) updates.notes = input.notes;
		if (input.requested_at != null) updates.requested_at = input.requested_at;

		await tx.update(requests).set(updates).where(eq(requests.id, existing.id));

		// Product/Service block save: wipe-and-reinsert, same as quotes/jobs. The
		// client-held line_key survives the reinsert so per-line references stay glued.
		if (input.line_items) {
			await tx
				.update(requestLineItems)
				.set({ deleted_at: new Date(), updated_at: new Date() })
				.where(
					and(
						eq(requestLineItems.request_id, existing.id),
						eq(requestLineItems.org_id, auth.orgId),
						isNull(requestLineItems.deleted_at)
					)
				);
			if (input.line_items.length > 0) {
				await tx
					.insert(requestLineItems)
					.values(toLineItemValues(auth.orgId, existing.id, input.line_items));
			}
		}
	});

	// Server-authoritative write-through: hand back the full updated entity so
	// the client store patches in place instead of refetching.
	const detail = await loadRequestDetail(
		auth.orgId,
		existing.id,
		auth.org.timezone || 'America/Chicago'
	);
	return json({ data: detail });
};

export const DELETE: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!canManageRequests(auth.member)) error(403, 'Forbidden');

	const [existing] = await db
		.select({ id: requests.id })
		.from(requests)
		.where(
			and(
				eq(requests.id, event.params.id),
				eq(requests.org_id, auth.orgId),
				isNull(requests.deleted_at)
			)
		)
		.limit(1);
	if (!existing) return json({ error: 'Request not found' }, { status: 404 });

	await db.transaction(async (tx) => {
		const now = new Date();
		await tx
			.update(requests)
			.set({ deleted_at: now, updated_at: now })
			.where(eq(requests.id, existing.id));
		// The request's assessment dies with it — it exists only to serve this
		// request, and soft-deleting frees the one-live-assessment slot.
		await tx
			.update(appointments)
			.set({ deleted_at: now, updated_at: now })
			.where(
				and(
					eq(appointments.request_id, existing.id),
					eq(appointments.org_id, auth.orgId),
					isNull(appointments.deleted_at)
				)
			);
	});

	return new Response(null, { status: 204 });
};
