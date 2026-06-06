import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import { messengerIntegrations } from '$lib/server/db/schema';
import { subscribePageToApp, type ManagedPage } from './graph';

// Subscribe a chosen Page to our app's webhook, then persist it as the org's one
// Messenger integration. Shared by the single-page auto-connect (callback) and
// the multi-page picker (POST /choose) so the unique-constraint and subscription
// handling can never diverge between the two entry points.
//
// No outbox event: connecting an integration is configuration, not a customer-
// facing business event. The Graph subscribe call happens BEFORE the single DB
// upsert — never inside a transaction (transaction-boundary law).

export type ConnectResult = { ok: true } | { ok: false; reason: 'page_taken' | 'subscribe_failed' };

export async function connectPage(
	orgId: string,
	memberId: string,
	page: ManagedPage
): Promise<ConnectResult> {
	// page_id is globally unique — block linking a Page already owned by another org.
	const [existing] = await db
		.select({ orgId: messengerIntegrations.org_id })
		.from(messengerIntegrations)
		.where(eq(messengerIntegrations.page_id, page.id))
		.limit(1);
	if (existing && existing.orgId !== orgId) return { ok: false, reason: 'page_taken' };

	try {
		await subscribePageToApp(page.id, page.access_token);
	} catch {
		return { ok: false, reason: 'subscribe_failed' };
	}

	// SECURITY TODO: page_access_token is stored in plaintext to match the existing
	// Stripe-credential convention. Move all integration secrets to Supabase Vault /
	// encryption-at-rest before production. Never log or echo this value.
	const now = new Date();
	const row = {
		page_id: page.id,
		page_name: page.name,
		page_access_token: page.access_token,
		status: 'connected' as const,
		subscribed: true,
		connected_by: memberId,
		deleted_at: null,
		updated_at: now
	};

	try {
		await db
			.insert(messengerIntegrations)
			.values({ org_id: orgId, ...row })
			.onConflictDoUpdate({ target: messengerIntegrations.org_id, set: row });
	} catch (err) {
		// Race: another org claimed this page_id between the pre-check and insert.
		// The page_id unique index (not the org_id conflict target) raises 23505.
		if (err && typeof err === 'object' && 'code' in err && err.code === '23505') {
			return { ok: false, reason: 'page_taken' };
		}
		throw err;
	}

	return { ok: true };
}
