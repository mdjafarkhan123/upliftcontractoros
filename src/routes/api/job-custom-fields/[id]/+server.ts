import { json, error } from '@sveltejs/kit';
import { and, eq, isNull } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { jobCustomFields } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { canManageJobCustomFields } from '$lib/server/jobs/permissions';
import { updateJobCustomFieldSchema } from '$lib/server/jobs/schemas';

// PATCH /api/job-custom-fields/[id] — edit a definition. field_type is immutable (changing it
// would strand values of the old type), so it isn't accepted. Editing a label is LIVE — it
// updates the field everywhere it appears (unlike snapshotted job forms).
export const PATCH: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!canManageJobCustomFields(auth.member)) error(403, 'Forbidden');

	const [existing] = await db
		.select({ id: jobCustomFields.id, field_type: jobCustomFields.field_type })
		.from(jobCustomFields)
		.where(
			and(
				eq(jobCustomFields.id, event.params.id),
				eq(jobCustomFields.org_id, auth.orgId),
				isNull(jobCustomFields.deleted_at)
			)
		)
		.limit(1);
	if (!existing) error(404, 'Not found');

	let body: unknown;
	try {
		body = await event.request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	const parsed = updateJobCustomFieldSchema.safeParse(body);
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

	// A dropdown must keep at least one option (create enforces it too).
	if (existing.field_type === 'dropdown' && input.options !== undefined) {
		const opts = (input.options ?? []).map((o) => o.trim()).filter((o) => o.length > 0);
		if (opts.length < 1) {
			return json(
				{ error: 'Add at least one dropdown option', field_errors: { options: 'Add at least one dropdown option' } },
				{ status: 422 }
			);
		}
	}

	const updates: Record<string, unknown> = { updated_at: new Date() };
	if (input.label !== undefined) updates.label = input.label;
	if (input.help_text !== undefined) updates.help_text = input.help_text?.trim() || null;
	if (input.required !== undefined) updates.required = input.required;
	if (input.position !== undefined) updates.position = String(input.position);
	// Options only apply to dropdown fields; ignored (kept null) for every other type.
	if (input.options !== undefined) {
		updates.options =
			existing.field_type === 'dropdown'
				? (input.options ?? []).map((o) => o.trim()).filter((o) => o.length > 0)
				: null;
	}

	await db.update(jobCustomFields).set(updates).where(eq(jobCustomFields.id, event.params.id));

	return new Response(null, { status: 204 });
};

// DELETE /api/job-custom-fields/[id] — soft-delete the definition. It vanishes from every job
// and Settings. Any stored values become orphaned but harmless (never shown; the loader only
// reads live definitions).
export const DELETE: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!canManageJobCustomFields(auth.member)) error(403, 'Forbidden');

	const result = await db
		.update(jobCustomFields)
		.set({ deleted_at: new Date() })
		.where(
			and(
				eq(jobCustomFields.id, event.params.id),
				eq(jobCustomFields.org_id, auth.orgId),
				isNull(jobCustomFields.deleted_at)
			)
		)
		.returning({ id: jobCustomFields.id });

	if (result.length === 0) error(404, 'Not found');
	return new Response(null, { status: 204 });
};
