import { json, error } from '@sveltejs/kit';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { jobFormFields, jobFormTemplates, orgMembers } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { canManageJobFormTemplates, canViewJobFormTemplates } from '$lib/server/jobs/permissions';
import { createJobFormTemplateSchema } from '$lib/server/jobs/schemas';

// GET /api/job-form-templates — list all live templates for the org (name + field count).
export const GET: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!canViewJobFormTemplates(auth.member)) error(403, 'Forbidden');

	const rows = await db
		.select({
			id: jobFormTemplates.id,
			name: jobFormTemplates.name,
			description: jobFormTemplates.description,
			created_by_name: orgMembers.full_name,
			created_at: jobFormTemplates.created_at,
			updated_at: jobFormTemplates.updated_at,
			field_count: sql<number>`(SELECT COUNT(*)::int FROM job_form_fields WHERE template_id = ${jobFormTemplates.id} AND deleted_at IS NULL)`
		})
		.from(jobFormTemplates)
		.leftJoin(orgMembers, eq(orgMembers.id, jobFormTemplates.created_by))
		.where(and(eq(jobFormTemplates.org_id, auth.orgId), isNull(jobFormTemplates.deleted_at)))
		.orderBy(desc(jobFormTemplates.updated_at));

	return json({
		data: {
			items: rows.map((r) => ({
				...r,
				created_at: r.created_at.toISOString(),
				updated_at: r.updated_at.toISOString()
			}))
		}
	});
};

// POST /api/job-form-templates — create a template + its fields.
export const POST: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!canManageJobFormTemplates(auth.member)) error(403, 'Forbidden');

	let body: unknown;
	try {
		body = await event.request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	const parsed = createJobFormTemplateSchema.safeParse(body);
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

	const created = await db.transaction(async (tx) => {
		const [tpl] = await tx
			.insert(jobFormTemplates)
			.values({
				org_id: auth.orgId,
				name: input.name,
				description: input.description?.trim() || null,
				created_by: auth.member.id
			})
			.returning({ id: jobFormTemplates.id });

		await tx.insert(jobFormFields).values(
			input.fields.map((f, idx) => ({
				org_id: auth.orgId,
				template_id: tpl.id,
				field_type: f.field_type,
				label: f.label,
				help_text: f.help_text?.trim() || null,
				required: f.field_type === 'section' ? false : (f.required ?? false),
				options:
					f.field_type === 'dropdown'
						? (f.options ?? []).map((o) => o.trim()).filter((o) => o.length > 0)
						: null,
				position: String(f.position ?? idx)
			}))
		);

		return tpl;
	});

	return json({ data: { id: created.id } }, { status: 201 });
};
