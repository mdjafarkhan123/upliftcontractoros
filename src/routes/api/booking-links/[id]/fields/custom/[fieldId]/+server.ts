// R5.2b — custom questions (edit / delete). Admin-gated. Only ever touches a
// kind='custom' row that belongs to this form — a standardized row id here is a
// 404 (it's managed via the /fields toggle route instead).

import { json, error } from '@sveltejs/kit';
import { and, asc, eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { bookingFormFields } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { requireFeature } from '$lib/server/auth/featureGuard';
import { loadBookingLinkForOrg } from '$lib/server/booking/loadBookingLink';
import {
	updateCustomQuestionSchema,
	toBuilderCustomFields
} from '$lib/server/booking/formFields';
import { customTypeHasOptions } from '$lib/types/bookingForms';

// Resolve the target custom row within the (already-gated) link. Returns null for
// anything that isn't a live custom question on this form.
async function loadCustomRow(linkId: string, orgId: string, fieldId: string) {
	const [row] = await db
		.select()
		.from(bookingFormFields)
		.where(
			and(
				eq(bookingFormFields.id, fieldId),
				eq(bookingFormFields.booking_link_id, linkId),
				eq(bookingFormFields.org_id, orgId),
				eq(bookingFormFields.kind, 'custom')
			)
		)
		.limit(1);
	return row ?? null;
}

async function freshCustomFields(linkId: string) {
	const fresh = await db
		.select()
		.from(bookingFormFields)
		.where(eq(bookingFormFields.booking_link_id, linkId))
		.orderBy(asc(bookingFormFields.position));
	return toBuilderCustomFields(fresh);
}

export const PATCH: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (auth.member.role !== 'admin') error(403, 'Admin only.');
	requireFeature(auth, 'feature_online_booking');

	const link = await loadBookingLinkForOrg(auth.orgId, event.params.id!);
	const row = await loadCustomRow(link.id, auth.orgId, event.params.fieldId!);
	if (!row) return json({ error: 'Question not found.' }, { status: 404 });

	let body: unknown;
	try {
		body = await event.request.json();
	} catch {
		return json({ error: 'Invalid JSON.' }, { status: 400 });
	}

	const parsed = updateCustomQuestionSchema.safeParse(body);
	if (!parsed.success) {
		const field_errors: Record<string, string> = {};
		for (const issue of parsed.error.issues) {
			const key = issue.path[0]?.toString();
			if (key && !field_errors[key]) field_errors[key] = issue.message;
		}
		return json({ error: 'Validation failed.', field_errors }, { status: 400 });
	}
	const q = parsed.data;

	await db
		.update(bookingFormFields)
		.set({
			question_type: q.type,
			label: q.label,
			help_text: q.help_text,
			placeholder: q.placeholder,
			options: customTypeHasOptions(q.type) ? q.options : null,
			is_required: q.is_required,
			updated_at: new Date()
		})
		.where(and(eq(bookingFormFields.id, row.id), eq(bookingFormFields.org_id, auth.orgId)));

	return json({ data: { custom_fields: await freshCustomFields(link.id) } });
};

export const DELETE: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (auth.member.role !== 'admin') error(403, 'Admin only.');
	requireFeature(auth, 'feature_online_booking');

	const link = await loadBookingLinkForOrg(auth.orgId, event.params.id!);
	const row = await loadCustomRow(link.id, auth.orgId, event.params.fieldId!);
	if (!row) return json({ error: 'Question not found.' }, { status: 404 });

	// Hard delete — the row is builder config, not a business record. Answers in
	// request_field_answers snapshot their own label/type/value, so past
	// submissions still read correctly after the question is removed.
	await db
		.delete(bookingFormFields)
		.where(and(eq(bookingFormFields.id, row.id), eq(bookingFormFields.org_id, auth.orgId)));

	return json({ data: { custom_fields: await freshCustomFields(link.id) } });
};
