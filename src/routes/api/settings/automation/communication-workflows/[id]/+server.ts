import { json, type RequestHandler } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import { communicationWorkflows } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { checkPermission } from '$lib/server/permissions';
import { communicationWorkflowSchema } from '$lib/server/communication-preferences/workflowSchema';

async function forbidden(memberId: string) {
	return (await checkPermission(memberId, 'can_edit_contacts'))
		? null
		: json({ error: 'Forbidden.' }, { status: 403 });
}

export const PATCH: RequestHandler = async ({ locals, params, request }) => {
	const auth = locals.auth;
	assertOrgActive(auth);
	const denied = await forbidden(auth.member.id);
	if (denied) return denied;
	if (!params.id) return json({ error: 'Workflow not found.' }, { status: 404 });
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
	const [workflow] = await db
		.update(communicationWorkflows)
		.set({
			name: parsed.data.name,
			status: parsed.data.status,
			trigger_filters: parsed.data.trigger_filters,
			action_config: parsed.data.action_config,
			enabled: parsed.data.status === 'published' && parsed.data.enabled,
			updated_at: new Date()
		})
		.where(
			and(eq(communicationWorkflows.id, params.id), eq(communicationWorkflows.org_id, auth.orgId))
		)
		.returning();
	if (!workflow) return json({ error: 'Workflow not found.' }, { status: 404 });
	return json({ data: workflow });
};

export const DELETE: RequestHandler = async ({ locals, params }) => {
	const auth = locals.auth;
	assertOrgActive(auth);
	const denied = await forbidden(auth.member.id);
	if (denied) return denied;
	if (!params.id) return json({ error: 'Workflow not found.' }, { status: 404 });
	const deleted = await db
		.delete(communicationWorkflows)
		.where(
			and(eq(communicationWorkflows.id, params.id), eq(communicationWorkflows.org_id, auth.orgId))
		)
		.returning({ id: communicationWorkflows.id });
	if (deleted.length === 0) return json({ error: 'Workflow not found.' }, { status: 404 });
	return new Response(null, { status: 204 });
};
