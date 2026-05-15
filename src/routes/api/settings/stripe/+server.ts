import { json, error } from '@sveltejs/kit';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import Stripe from 'stripe';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { organizations } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import {
	isValidStripeRestrictedKey,
	isValidStripePublishableKey,
	isValidStripeWebhookSecret,
	maskSecret
} from '$lib/utils/validation/stripeKeyFormat';

// =====================================================================
// TODO: SECURITY — Move Stripe credential storage to Supabase Vault /
// encrypted-at-rest implementation before production deployment.
// For v1 only, plaintext storage is acceptable but secrets MUST NEVER be
// logged, echoed in errors, or returned to the client after initial save.
// =====================================================================

function assertAdmin(role: string): void {
	if (role !== 'admin') error(403, 'Admin only.');
}

const stripePostSchema = z
	.object({
		stripe_restricted_key: z.string().min(1),
		stripe_publishable_key: z.string().min(1),
		stripe_webhook_secret: z.string().min(1)
	})
	.strict();

function logEvent(
	level: 'info' | 'warn' | 'error',
	event: string,
	ctx: Record<string, unknown>
) {
	console.log(JSON.stringify({ level, event, ...ctx }));
}

export const GET: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	assertAdmin(auth.member.role);

	const [row] = await db
		.select({
			stripe_restricted_key: organizations.stripe_restricted_key,
			stripe_publishable_key: organizations.stripe_publishable_key,
			stripe_webhook_secret: organizations.stripe_webhook_secret,
			stripe_account_id: organizations.stripe_account_id,
			stripe_connected_at: organizations.stripe_connected_at
		})
		.from(organizations)
		.where(eq(organizations.id, auth.orgId))
		.limit(1);

	if (!row) error(404, 'Organization not found.');

	return json({
		data: {
			stripe_restricted_key_masked: maskSecret(row.stripe_restricted_key),
			stripe_publishable_key: row.stripe_publishable_key, // pk is public, OK to return
			stripe_webhook_secret_masked: maskSecret(row.stripe_webhook_secret),
			stripe_account_id: row.stripe_account_id,
			stripe_connected_at: row.stripe_connected_at,
			is_connected:
				!!row.stripe_restricted_key &&
				!!row.stripe_publishable_key &&
				!!row.stripe_webhook_secret
		}
	});
};

export const POST: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	assertAdmin(auth.member.role);

	let body: unknown;
	try {
		body = await event.request.json();
	} catch {
		return json({ error: 'Invalid JSON.' }, { status: 400 });
	}

	const parsed = stripePostSchema.safeParse(body);
	if (!parsed.success) {
		return json({ error: 'Missing or invalid fields.' }, { status: 400 });
	}

	const { stripe_restricted_key, stripe_publishable_key, stripe_webhook_secret } = parsed.data;

	const field_errors: Record<string, string> = {};
	if (!isValidStripeRestrictedKey(stripe_restricted_key)) {
		field_errors.stripe_restricted_key = 'Must be a valid restricted key (rk_live_… or rk_test_…).';
	}
	if (!isValidStripePublishableKey(stripe_publishable_key)) {
		field_errors.stripe_publishable_key = 'Must be a valid publishable key (pk_live_… or pk_test_…).';
	}
	if (!isValidStripeWebhookSecret(stripe_webhook_secret)) {
		field_errors.stripe_webhook_secret = 'Must be a valid webhook signing secret (whsec_…).';
	}
	if (Object.keys(field_errors).length > 0) {
		return json({ error: 'Validation failed.', field_errors }, { status: 400 });
	}

	// Test connection — never expose raw Stripe response or error message.
	const accountId: string | null = null;
	try {
		const stripe = new Stripe(stripe_restricted_key, { apiVersion: '2026-04-22.dahlia' });
		await stripe.balance.retrieve();
	} catch (err) {
		logEvent('warn', 'settings.stripe.connect.test_failed', {
			request_id: crypto.randomUUID(),
			org_id: auth.orgId,
			member_id: auth.member.id,
			route: 'POST /api/settings/stripe',
			error_kind: err instanceof Stripe.errors.StripeError ? err.type : 'unknown'
		});
		return json(
			{
				error:
					'Could not connect to Stripe with that key. Make sure it is correct and has the required scopes.',
				field_errors: { stripe_restricted_key: 'Stripe rejected this key.' }
			},
			{ status: 422 }
		);
	}

	const now = new Date();
	await db
		.update(organizations)
		.set({
			stripe_restricted_key,
			stripe_publishable_key,
			stripe_webhook_secret,
			stripe_account_id: accountId,
			stripe_connected_at: now,
			updated_at: now
		})
		.where(eq(organizations.id, auth.orgId));

	logEvent('info', 'settings.stripe.connected', {
		request_id: crypto.randomUUID(),
		org_id: auth.orgId,
		member_id: auth.member.id,
		route: 'POST /api/settings/stripe',
		account_id_present: !!accountId
	});

	return json({
		data: {
			stripe_restricted_key_masked: maskSecret(stripe_restricted_key),
			stripe_publishable_key,
			stripe_webhook_secret_masked: maskSecret(stripe_webhook_secret),
			stripe_account_id: accountId,
			stripe_connected_at: now.toISOString(),
			is_connected: true
		}
	});
};

export const DELETE: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	assertAdmin(auth.member.role);

	await db
		.update(organizations)
		.set({
			stripe_restricted_key: null,
			stripe_publishable_key: null,
			stripe_webhook_secret: null,
			stripe_account_id: null,
			stripe_connected_at: null,
			updated_at: new Date()
		})
		.where(eq(organizations.id, auth.orgId));

	logEvent('info', 'settings.stripe.disconnected', {
		request_id: crypto.randomUUID(),
		org_id: auth.orgId,
		member_id: auth.member.id,
		route: 'DELETE /api/settings/stripe'
	});

	return new Response(null, { status: 204 });
};
