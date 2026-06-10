import { json, error } from '@sveltejs/kit';
import { z } from 'zod';
import { eq, asc } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { organizations, emailDomains, emailSenderAddresses } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { defaultLocalPart } from '$lib/server/email/senderAddresses';

// Extra branded From-addresses are admin-only, matching the sibling /api/settings/org
// and /api/settings/email endpoints — the whole settings area gates on role==='admin'.
function assertAdmin(role: string): void {
	if (role !== 'admin') error(403, 'Admin only.');
}

// Soft cap so a single org can't fill the picker with hundreds of addresses.
const MAX_EXTRA_ADDRESSES = 10;

// Same local-part rule as the default address (senderAddresses.ts localPart sanitizer):
// lowercase letters, digits and single hyphens, no leading/trailing hyphen.
const localPartSchema = z
	.string()
	.trim()
	.toLowerCase()
	.min(1, 'Required.')
	.max(64, 'Too long (max 64 characters).')
	.regex(
		/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/,
		'Use lowercase letters, numbers and hyphens only — no leading or trailing hyphen.'
	);

const labelSchema = z.string().trim().max(40, 'Too long (max 40 characters).').optional();

const createSchema = z.object({ local_part: localPartSchema, label: labelSchema }).strict();

async function listAddresses(orgId: string) {
	return db
		.select({
			id: emailSenderAddresses.id,
			local_part: emailSenderAddresses.local_part,
			label: emailSenderAddresses.label
		})
		.from(emailSenderAddresses)
		.where(eq(emailSenderAddresses.org_id, orgId))
		.orderBy(asc(emailSenderAddresses.created_at));
}

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

	const parsed = createSchema.safeParse(body);
	if (!parsed.success) {
		const field_errors: Record<string, string> = {};
		for (const issue of parsed.error.issues) {
			const key = issue.path[0]?.toString();
			if (key) field_errors[key] = issue.message;
		}
		return json({ error: 'Unknown or invalid fields.', field_errors }, { status: 400 });
	}

	const [org] = await db
		.select({ slug: organizations.slug, email_sender_local: organizations.email_sender_local })
		.from(organizations)
		.where(eq(organizations.id, auth.orgId))
		.limit(1);
	if (!org) error(404, 'Organization not found.');

	// Extra addresses sit on the verified sending domain — without one there is no
	// domain to attach them to. (The default address can be chosen pre-domain on the
	// Stage 1 form; extras cannot.)
	const [domainRow] = await db
		.select({ id: emailDomains.id })
		.from(emailDomains)
		.where(eq(emailDomains.org_id, auth.orgId))
		.limit(1);
	if (!domainRow) {
		return json(
			{ error: 'Set up your sending domain before adding more addresses.' },
			{ status: 409 }
		);
	}

	const localPart = parsed.data.local_part;

	// Reject collision with the default address (which lives on organizations, not in
	// this table, so the unique index can't catch it).
	if (localPart === defaultLocalPart(org)) {
		return json(
			{
				error: 'That is already your default address.',
				field_errors: { local_part: 'Already your default address.' }
			},
			{ status: 409 }
		);
	}

	const existing = await listAddresses(auth.orgId);
	if (existing.some((a) => a.local_part === localPart)) {
		return json(
			{
				error: 'You already have that address.',
				field_errors: { local_part: 'Address already exists.' }
			},
			{ status: 409 }
		);
	}
	if (existing.length >= MAX_EXTRA_ADDRESSES) {
		return json(
			{ error: `You can add up to ${MAX_EXTRA_ADDRESSES} extra addresses.` },
			{ status: 409 }
		);
	}

	await db.insert(emailSenderAddresses).values({
		org_id: auth.orgId,
		email_domain_id: domainRow.id,
		local_part: localPart,
		label: parsed.data.label || null
	});

	const addresses = await listAddresses(auth.orgId);
	return json({ data: { addresses } }, { status: 201 });
};
