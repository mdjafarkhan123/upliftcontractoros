import { json, error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import Stripe from 'stripe';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { organizations } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';

function assertAdmin(role: string): void {
	if (role !== 'admin') error(403, 'Admin only.');
}

function logEvent(level: 'info' | 'warn' | 'error', event: string, ctx: Record<string, unknown>) {
	console.log(JSON.stringify({ level, event, ...ctx }));
}

export const POST: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	assertAdmin(auth.member.role);

	const [row] = await db
		.select({
			stripe_restricted_key: organizations.stripe_restricted_key
		})
		.from(organizations)
		.where(eq(organizations.id, auth.orgId))
		.limit(1);

	if (!row?.stripe_restricted_key) {
		return json({ error: 'Stripe is not connected yet.' }, { status: 422 });
	}

	const stripe = new Stripe(row.stripe_restricted_key, { apiVersion: '2026-04-22.dahlia' });

	let livemode: boolean;
	let accountName: string | null = null;
	let accountEmail: string | null = null;
	let accountId: string | null = null;
	try {
		const balance = await stripe.balance.retrieve();
		livemode = balance.livemode;
	} catch (err) {
		logEvent('warn', 'settings.stripe.test.failed', {
			org_id: auth.orgId,
			member_id: auth.member.id,
			error_kind: err instanceof Stripe.errors.StripeError ? err.type : 'unknown'
		});
		return json(
			{
				error:
					'Stripe rejected the saved key. Please reconnect — your key may have been revoked or its permissions changed.'
			},
			{ status: 422 }
		);
	}

	try {
		const account = await stripe.accounts.retrieve(null);
		accountId = account.id ?? null;
		accountName = account.business_profile?.name ?? account.settings?.dashboard?.display_name ?? null;
		accountEmail = account.email ?? null;
	} catch {
		// Account metadata is best-effort; ignore.
	}

	const verifiedAt = new Date();
	await db
		.update(organizations)
		.set({
			stripe_livemode: livemode,
			stripe_account_id: accountId,
			stripe_account_name: accountName,
			stripe_account_email: accountEmail,
			stripe_last_verified_at: verifiedAt,
			updated_at: verifiedAt
		})
		.where(eq(organizations.id, auth.orgId));

	logEvent('info', 'settings.stripe.test.ok', {
		org_id: auth.orgId,
		member_id: auth.member.id,
		livemode
	});

	return json({
		data: {
			ok: true,
			livemode,
			stripe_account_id: accountId,
			stripe_account_name: accountName,
			stripe_account_email: accountEmail,
			stripe_last_verified_at: verifiedAt.toISOString()
		}
	});
};
