import { json } from '@sveltejs/kit';
import { desc, eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { organizations, outboxEvents } from '$lib/server/db/schema';
import { createOrgSchema, createOrganizationWithAdmin } from '$lib/server/admin/orgProvisioning';

export async function GET() {
	const orgs = await db
		.select({
			id: organizations.id,
			name: organizations.name,
			slug: organizations.slug,
			status: organizations.status,
			trade_type: organizations.trade_type,
			is_setup_complete: organizations.is_setup_complete,
			created_at: organizations.created_at
		})
		.from(organizations)
		.orderBy(desc(organizations.created_at));

	const deadLetters = await db
		.select({
			id: outboxEvents.id,
			org_id: outboxEvents.org_id,
			event_type: outboxEvents.event_type,
			last_error: outboxEvents.last_error,
			attempts: outboxEvents.attempts,
			dead_lettered_at: outboxEvents.dead_lettered_at
		})
		.from(outboxEvents)
		.where(eq(outboxEvents.status, 'dead_lettered'))
		.orderBy(desc(outboxEvents.dead_lettered_at));

	return json({ orgs, deadLetters });
}

export const POST: RequestHandler = async ({ request }) => {
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON body.' }, { status: 400 });
	}

	const parsed = createOrgSchema.safeParse(body);
	if (!parsed.success) {
		return json(
			{ error: parsed.error.issues[0]?.message ?? 'Invalid form data.' },
			{ status: 400 }
		);
	}

	try {
		const { orgId } = await createOrganizationWithAdmin(parsed.data);
		return json({ orgId }, { status: 201 });
	} catch (error) {
		return json(
			{ error: error instanceof Error ? error.message : 'Organization creation failed.' },
			{ status: 500 }
		);
	}
};
