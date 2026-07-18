// R5.2b — custom questions (create). Admin-gated. Appends a new custom question
// to a request form's field list. Standardized fields keep their own /fields
// PATCH route; this route only ever writes kind='custom' rows.

import { json, error } from '@sveltejs/kit';
import { asc, eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { bookingFormFields } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { requireFeature } from '$lib/server/auth/featureGuard';
import { loadBookingLinkForOrg } from '$lib/server/booking/loadBookingLink';
import {
	createCustomQuestionSchema,
	toBuilderCustomFields
} from '$lib/server/booking/formFields';
import { customTypeHasOptions } from '$lib/types/bookingForms';

const MAX_CUSTOM_QUESTIONS = 30;

export const POST: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (auth.member.role !== 'admin') error(403, 'Admin only.');
	requireFeature(auth, 'feature_online_booking');

	const link = await loadBookingLinkForOrg(auth.orgId, event.params.id!);

	let body: unknown;
	try {
		body = await event.request.json();
	} catch {
		return json({ error: 'Invalid JSON.' }, { status: 400 });
	}

	const parsed = createCustomQuestionSchema.safeParse(body);
	if (!parsed.success) {
		const field_errors: Record<string, string> = {};
		for (const issue of parsed.error.issues) {
			const key = issue.path[0]?.toString();
			if (key && !field_errors[key]) field_errors[key] = issue.message;
		}
		return json({ error: 'Validation failed.', field_errors }, { status: 400 });
	}
	const q = parsed.data;

	// Current rows: cap custom questions + compute the append position (after every
	// existing item, standard or custom).
	const rows = await db
		.select()
		.from(bookingFormFields)
		.where(eq(bookingFormFields.booking_link_id, link.id))
		.orderBy(asc(bookingFormFields.position));

	const customCount = rows.filter((r) => r.kind === 'custom').length;
	if (customCount >= MAX_CUSTOM_QUESTIONS) {
		return json(
			{ error: `You can add up to ${MAX_CUSTOM_QUESTIONS} custom questions.` },
			{ status: 400 }
		);
	}

	const nextPosition = rows.reduce((max, r) => Math.max(max, r.position), -1) + 1;

	await db.insert(bookingFormFields).values({
		org_id: auth.orgId,
		booking_link_id: link.id,
		kind: 'custom',
		standard_key: null,
		question_type: q.type,
		label: q.label,
		help_text: q.help_text,
		placeholder: q.placeholder,
		options: customTypeHasOptions(q.type) ? q.options : null,
		is_enabled: true,
		is_required: q.is_required,
		is_locked: false,
		position: nextPosition
	});

	// Write-through: return the fresh custom-question list so the client patches state.
	const fresh = await db
		.select()
		.from(bookingFormFields)
		.where(eq(bookingFormFields.booking_link_id, link.id))
		.orderBy(asc(bookingFormFields.position));

	return json({ data: { custom_fields: toBuilderCustomFields(fresh) } }, { status: 201 });
};
