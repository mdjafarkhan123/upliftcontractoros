import { json, error } from '@sveltejs/kit';
import { and, eq, isNull, sql } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { jobCustomFields } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { canManageJobCustomFields, canViewJobCustomFields } from '$lib/server/jobs/permissions';
import { createJobCustomFieldSchema } from '$lib/server/jobs/schemas';
import { loadJobCustomFieldDefs } from '$lib/server/jobs/customFieldsResponse';

// GET /api/job-custom-fields — list the org's live custom-field definitions.
export const GET: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!canViewJobCustomFields(auth.member)) error(403, 'Forbidden');

	const items = await loadJobCustomFieldDefs(auth.orgId);
	return json({ data: { items } });
};

// POST /api/job-custom-fields — create one custom-field definition.
export const POST: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!canManageJobCustomFields(auth.member)) error(403, 'Forbidden');

	let body: unknown;
	try {
		body = await event.request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	const parsed = createJobCustomFieldSchema.safeParse(body);
	if (!parsed.success) {
		const field_errors: Record<string, string> = {};
		for (const issue of parsed.error.issues) {
			const p = issue.path.join('.');
			if (p && !field_errors[p]) field_errors[p] = issue.message;
		}
		return json(
			{ error: parsed.error.issues[0]?.message ?? 'Invalid input', field_errors },
			{ status: 422 }
		);
	}
	const input = parsed.data;

	// Default a new field to the end of the list when no explicit position was sent.
	let position = input.position;
	if (position === undefined) {
		const [maxRow] = await db
			.select({ max: sql<number>`COALESCE(MAX(${jobCustomFields.position}), -1)` })
			.from(jobCustomFields)
			.where(and(eq(jobCustomFields.org_id, auth.orgId), isNull(jobCustomFields.deleted_at)));
		position = Number(maxRow?.max ?? -1) + 1;
	}

	const [created] = await db
		.insert(jobCustomFields)
		.values({
			org_id: auth.orgId,
			field_type: input.field_type,
			label: input.label,
			help_text: input.help_text?.trim() || null,
			required: input.required ?? false,
			options:
				input.field_type === 'dropdown'
					? (input.options ?? []).map((o) => o.trim()).filter((o) => o.length > 0)
					: null,
			position: String(position),
			created_by: auth.member.id
		})
		.returning({ id: jobCustomFields.id });

	return json({ data: { id: created.id } }, { status: 201 });
};
