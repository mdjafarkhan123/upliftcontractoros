import { json } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { organizations } from '$lib/server/db/schema';
import { createSubaccount, purchaseNumber } from '$lib/server/twilio/provisioning';
import { isSmsSupportedCountry } from '$lib/utils/countries';

// Onboarding Step 3 — purchase a business number (Onboarding.md Part 3 / plan 5.2).
// Creates a per-contractor Twilio subaccount, buys the chosen number under it,
// wires its webhooks, then persists number + subaccount creds on the org. All
// Twilio calls run OUTSIDE any DB transaction. Limit: one number per org.
//
// Approval gating: US/Canada require carrier registration (10DLC / CWTA) before
// outbound SMS — we mark the org 'pending' so outbound stays blocked until
// approved; inbound + calls work immediately. Other countries → 'not_required'.
const APPROVAL_REQUIRED_COUNTRIES = new Set(['US', 'CA']);

// E.164 — Twilio returns numbers in this form; reject anything else.
const purchaseSchema = z.object({
	phoneNumber: z
		.string()
		.trim()
		.regex(/^\+[1-9]\d{6,14}$/, 'Select a valid number.')
});

export const POST: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	if (!auth) return json({ error: 'Unauthorized.' }, { status: 401 });

	// Phone setup runs in the wizard (pending_setup) and in Settings → Integrations
	// (active). See the search route for the shared rationale (plan 7.2).
	if (auth.orgStatus !== 'pending_setup' && auth.orgStatus !== 'active') {
		return new Response(null, { status: 204 });
	}
	if (auth.member.role !== 'admin') {
		return json({ error: 'Admin only.' }, { status: 403 });
	}
	if (auth.orgStatus === 'pending_setup' && !auth.supabaseUser.app_metadata.password_changed) {
		return json({ error: 'Complete the previous steps first.' }, { status: 400 });
	}
	const org = auth.org;
	if (!org.sms_enabled) {
		return json({ error: 'SMS is not enabled for this organization.' }, { status: 400 });
	}
	if (!org.country) {
		return json({ error: 'Set your business country first.' }, { status: 400 });
	}
	// UX/safety pre-filter — mirrors the search route. Twilio is still the real gate.
	if (!isSmsSupportedCountry(org.country)) {
		return json({ error: 'SMS is not available in your region.' }, { status: 400 });
	}
	// One number per org. A number already on the org means setup is done — block
	// a second purchase (and the accidental orphaning of the existing subaccount).
	if (org.twilio_phone_number) {
		return json({ error: 'This organization already has a business number.' }, { status: 409 });
	}

	let body: unknown;
	try {
		body = await event.request.json();
	} catch {
		return json({ error: 'Invalid request body.' }, { status: 400 });
	}

	const parsed = purchaseSchema.safeParse(body);
	if (!parsed.success) {
		const field_errors: Record<string, string> = {};
		for (const issue of parsed.error.issues) {
			const key = issue.path[0];
			if (typeof key === 'string' && !field_errors[key]) field_errors[key] = issue.message;
		}
		return json({ error: 'Please fix the errors below.', field_errors }, { status: 400 });
	}

	const { phoneNumber } = parsed.data;

	// 1. Create the contractor's subaccount (parent creds). If purchase later fails,
	//    this leaves an empty subaccount behind — harmless (no number, no charge);
	//    a retry creates a fresh one.
	let subaccount;
	try {
		subaccount = await createSubaccount(`${org.name} — ${org.id}`);
	} catch (err) {
		console.error('[onboarding/phone/purchase] subaccount create failed', {
			org_id: org.id,
			error: err instanceof Error ? err.message : String(err)
		});
		return json(
			{ error: 'Could not set up your phone account. Please try again.' },
			{ status: 502 }
		);
	}

	// 2. Buy the number under the subaccount and configure its webhooks.
	try {
		await purchaseNumber(subaccount.sid, phoneNumber);
	} catch (err) {
		console.error('[onboarding/phone/purchase] number purchase failed', {
			org_id: org.id,
			subaccount_sid: subaccount.sid,
			phone_number: phoneNumber,
			error: err instanceof Error ? err.message : String(err)
		});
		return json(
			{ error: 'That number is no longer available. Please pick another.' },
			{ status: 502 }
		);
	}

	// 3. Persist. Outbound for US/CA stays gated until carrier approval.
	const approvalStatus = APPROVAL_REQUIRED_COUNTRIES.has(org.country) ? 'pending' : 'not_required';

	await db
		.update(organizations)
		.set({
			twilio_phone_number: phoneNumber,
			twilio_subaccount_sid: subaccount.sid,
			twilio_subaccount_auth_token: subaccount.authToken,
			sms_approval_status: approvalStatus,
			sms_approval_submitted_at: approvalStatus === 'pending' ? new Date() : null,
			updated_at: new Date()
		})
		.where(eq(organizations.id, org.id));

	return json({
		data: { phone_number: phoneNumber, sms_approval_status: approvalStatus }
	});
};
