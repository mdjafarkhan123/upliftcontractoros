import { error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import { organizations } from '$lib/server/db/schema';

export async function assertOrgActive(
	orgId: string,
	options?: { requireSetupComplete?: boolean }
): Promise<void> {
	const [org] = await db
		.select({ status: organizations.status, is_setup_complete: organizations.is_setup_complete })
		.from(organizations)
		.where(eq(organizations.id, orgId))
		.limit(1);

	if (!org) error(403, 'Organization not found.');

	if (
		org.status === 'suspended' ||
		org.status === 'pending_deletion' ||
		org.status === 'deleted'
	) {
		error(403, 'Organization is not active.');
	}

	if (options?.requireSetupComplete && !org.is_setup_complete) {
		error(403, 'Organization setup is not complete.');
	}
}
