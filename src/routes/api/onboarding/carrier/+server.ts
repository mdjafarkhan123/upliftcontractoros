import { json } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { organizations, outboxEvents } from '$lib/server/db/schema';

// Onboarding Step 4 — Carrier Approval data (Onboarding.md Step 4). Collected from
// the contractor (US 10DLC / CA CWTA) and later copied by the PO for manual Twilio
// submission. Skippable in the wizard. Address is reused from the existing
// business-profile columns, not re-collected here.
//
// Runs in the wizard (pending_setup) AND in Settings (active), mirroring the phone
// routes — so a future "fill it later" surface reuses this same write path.
//
// On success this UPDATEs the carrier fields and INSERTs a `carrier.submitted`
// outbox event in the same transaction; the outbox worker emails the PO. External
// calls (email) never happen in this handler — Transaction Boundary Law.

const APPROVAL_REQUIRED_COUNTRIES = new Set(['US', 'CA']);

const requiredText = (label: string, max = 200) =>
	z
		.string({ error: `${label} is required.` })
		.trim()
		.min(1, `${label} is required.`)
		.max(max);

// US 10DLC: legal name + EIN + website + use case. Address comes from the profile.
const usSchema = z.object({
	country: z.literal('US'),
	legal_business_name: requiredText('Legal business name'),
	ein: requiredText('EIN', 20),
	website: requiredText('Website', 300),
	messaging_use_case: requiredText('Messaging use case', 2000)
});

// CA CWTA: business name + Business Number. Address comes from the profile.
const caSchema = z.object({
	country: z.literal('CA'),
	legal_business_name: requiredText('Business name'),
	business_number: requiredText('Business Number', 50)
});

const carrierSchema = z.discriminatedUnion('country', [usSchema, caSchema]);

export const POST: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	if (!auth) return json({ error: 'Unauthorized.' }, { status: 401 });

	// Carrier data is set in the wizard (pending_setup) and, later, in Settings
	// (active). Any other status is an idempotent no-op.
	if (auth.orgStatus !== 'pending_setup' && auth.orgStatus !== 'active') {
		return new Response(null, { status: 204 });
	}
	if (auth.member.role !== 'admin') {
		return json({ error: 'Admin only.' }, { status: 403 });
	}
	// Enforce step order only inside the wizard.
	if (auth.orgStatus === 'pending_setup' && !auth.supabaseUser.app_metadata.password_changed) {
		return json({ error: 'Complete the previous steps first.' }, { status: 400 });
	}

	const org = auth.org;

	// Carrier registration only applies to US/CA orgs that have a number.
	if (!org.country || !APPROVAL_REQUIRED_COUNTRIES.has(org.country)) {
		return json(
			{ error: 'Carrier registration is not required for your region.' },
			{ status: 400 }
		);
	}
	if (!org.twilio_phone_number) {
		return json({ error: 'Set up a business number first.' }, { status: 400 });
	}

	let body: unknown;
	try {
		body = await event.request.json();
	} catch {
		return json({ error: 'Invalid request body.' }, { status: 400 });
	}

	// Lock the discriminator to the org's own country — the client never chooses it.
	const parsed = carrierSchema.safeParse({
		...(body && typeof body === 'object' ? body : {}),
		country: org.country
	});
	if (!parsed.success) {
		const field_errors: Record<string, string> = {};
		for (const issue of parsed.error.issues) {
			const key = issue.path[0];
			if (typeof key === 'string' && key !== 'country' && !field_errors[key]) {
				field_errors[key] = issue.message;
			}
		}
		return json({ error: 'Please fix the errors below.', field_errors }, { status: 400 });
	}

	const data = parsed.data;
	const updates: Partial<typeof organizations.$inferInsert> = {
		legal_business_name: data.legal_business_name,
		updated_at: new Date()
	};
	if (data.country === 'US') {
		updates.ein = data.ein;
		updates.website = data.website;
		updates.messaging_use_case = data.messaging_use_case;
	} else {
		updates.business_number = data.business_number;
	}

	// Update + outbox event in one transaction. The worker sends the PO email.
	await db.transaction(async (tx) => {
		await tx.update(organizations).set(updates).where(eq(organizations.id, org.id));
		await tx.insert(outboxEvents).values({
			org_id: org.id,
			event_type: 'carrier.submitted',
			resource_type: 'organization',
			resource_id: org.id,
			payload: {
				org_id: org.id,
				org_name: org.name,
				country: data.country,
				legal_business_name: data.legal_business_name,
				ein: data.country === 'US' ? data.ein : null,
				business_number: data.country === 'CA' ? data.business_number : null,
				website: data.country === 'US' ? data.website : null,
				messaging_use_case: data.country === 'US' ? data.messaging_use_case : null
			},
			// Fresh per submission so re-edits re-notify the PO.
			idempotency_key: `carrier.submitted:${org.id}:${Date.now()}`
		});
	});

	return new Response(null, { status: 204 });
};
