import { json, error } from '@sveltejs/kit';
import { and, eq, isNull, inArray } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { jobFormFields, jobFormTemplates } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { canManageJobFormTemplates, canViewJobFormTemplates } from '$lib/server/jobs/permissions';
import { updateJobFormTemplateSchema } from '$lib/server/jobs/schemas';
import { loadJobFormTemplate } from '$lib/server/jobs/formTemplateResponse';

// GET /api/job-form-templates/[id] — one template + its fields.
export const GET: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!canViewJobFormTemplates(auth.member)) error(403, 'Forbidden');

	const tpl = await loadJobFormTemplate(auth.orgId, event.params.id);
	if (!tpl) error(404, 'Not found');

	return json({ data: { template: tpl } });
};

// PATCH /api/job-form-templates/[id] — replace name/description + full field set.
export const PATCH: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!canManageJobFormTemplates(auth.member)) error(403, 'Forbidden');

	const [existing] = await db
		.select({ id: jobFormTemplates.id })
		.from(jobFormTemplates)
		.where(
			and(
				eq(jobFormTemplates.id, event.params.id),
				eq(jobFormTemplates.org_id, auth.orgId),
				isNull(jobFormTemplates.deleted_at)
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

	const parsed = updateJobFormTemplateSchema.safeParse(body);
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
	const templateId = event.params.id;

	await db.transaction(async (tx) => {
		await tx
			.update(jobFormTemplates)
			.set({
				name: input.name,
				description: input.description?.trim() || null,
				updated_at: new Date()
			})
			.where(eq(jobFormTemplates.id, templateId));

		// Live field ids currently on the template.
		const liveRows = await tx
			.select({ id: jobFormFields.id })
			.from(jobFormFields)
			.where(
				and(
					eq(jobFormFields.template_id, templateId),
					eq(jobFormFields.org_id, auth.orgId),
					isNull(jobFormFields.deleted_at)
				)
			);
		const liveIds = new Set(liveRows.map((r) => r.id));

		const keptIds = new Set<string>();
		for (let idx = 0; idx < input.fields.length; idx++) {
			const f = input.fields[idx];
			const values = {
				field_type: f.field_type,
				label: f.label,
				help_text: f.help_text?.trim() || null,
				required: f.field_type === 'section' ? false : (f.required ?? false),
				options:
					f.field_type === 'dropdown'
						? (f.options ?? []).map((o) => o.trim()).filter((o) => o.length > 0)
						: null,
				position: String(f.position ?? idx)
			};

			// Update in place only when the id genuinely belongs to this template (guards
			// against a client sending a field id from another template).
			if (f.id && liveIds.has(f.id)) {
				await tx
					.update(jobFormFields)
					.set({ ...values, updated_at: new Date() })
					.where(eq(jobFormFields.id, f.id));
				keptIds.add(f.id);
			} else {
				await tx.insert(jobFormFields).values({
					org_id: auth.orgId,
					template_id: templateId,
					...values
				});
			}
		}

		// Soft-delete any live field the client dropped.
		const removed = [...liveIds].filter((id) => !keptIds.has(id));
		if (removed.length > 0) {
			await tx
				.update(jobFormFields)
				.set({ deleted_at: new Date() })
				.where(inArray(jobFormFields.id, removed));
		}
	});

	const template = await loadJobFormTemplate(auth.orgId, templateId);
	return json({ data: { template } });
};

// DELETE /api/job-form-templates/[id] — soft-delete the template.
export const DELETE: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!canManageJobFormTemplates(auth.member)) error(403, 'Forbidden');

	const result = await db
		.update(jobFormTemplates)
		.set({ deleted_at: new Date() })
		.where(
			and(
				eq(jobFormTemplates.id, event.params.id),
				eq(jobFormTemplates.org_id, auth.orgId),
				isNull(jobFormTemplates.deleted_at)
			)
		)
		.returning({ id: jobFormTemplates.id });

	if (result.length === 0) error(404, 'Not found');
	return new Response(null, { status: 204 });
};
