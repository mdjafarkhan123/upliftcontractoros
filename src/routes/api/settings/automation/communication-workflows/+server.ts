import { json, type RequestHandler } from '@sveltejs/kit';
import { desc, eq } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import { communicationWorkflows } from '$lib/server/db/schema';
import { checkPermission } from '$lib/server/permissions';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { communicationWorkflowSchema } from '$lib/server/communication-preferences/workflowSchema';

async function assertWorkflowPermission(memberId: string) {
	if (!(await checkPermission(memberId, 'can_edit_contacts'))) {
		return json({ error: 'Forbidden.' }, { status: 403 });
	}
	return null;
}

export const GET: RequestHandler = async ({ locals }) => {
	const auth = locals.auth;
	assertOrgActive(auth);
	const forbidden = await assertWorkflowPermission(auth.member.id);
	if (forbidden) return forbidden;
	const rows = await db
		.select()
		.from(communicationWorkflows)
		.where(eq(communicationWorkflows.org_id, auth.orgId))
		.orderBy(desc(communicationWorkflows.updated_at));
	return json({ data: rows });
};

export const POST: RequestHandler = async ({ locals, request }) => {
	const auth = locals.auth;
	assertOrgActive(auth);
	const forbidden = await assertWorkflowPermission(auth.member.id);
	if (forbidden) return forbidden;
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON.' }, { status: 400 });
	}
	const parsed = communicationWorkflowSchema.safeParse(body);
	if (!parsed.success) {
		const field_errors: Record<string, string> = {};
		for (const issue of parsed.error.issues) {
			const field = issue.path[0]?.toString();
			if (field) field_errors[field] = issue.message;
		}
		return json({ error: 'Invalid communication workflow.', field_errors }, { status: 422 });
	}
	const now = new Date();
	const [workflow] = await db
		.insert(communicationWorkflows)
		.values({
			org_id: auth.orgId,
			name: parsed.data.name,
			status: parsed.data.status,
			trigger: 'contact_dnd',
			trigger_filters: parsed.data.trigger_filters,
			action: 'dnd_contact',
			action_config: parsed.data.action_config,
			enabled: parsed.data.status === 'published' && parsed.data.enabled,
			created_by_member_id: auth.member.id,
			created_at: now,
			updated_at: now
		})
		.returning();
	return json({ data: workflow }, { status: 201 });
};
