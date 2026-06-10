import { json, error } from '@sveltejs/kit';
import { z } from 'zod';
import { eq, and, asc, ne } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { organizations, emailSenderAddresses } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { defaultLocalPart } from '$lib/server/email/senderAddresses';

function assertAdmin(role: string): void {
	if (role !== 'admin') error(403, 'Admin only.');
}

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

const labelSchema = z.string().trim().max(40, 'Too long (max 40 characters).').nullish();

// At least one field must be present; both are optional individually.
const patchSchema = z
	.object({ local_part: localPartSchema.optional(), label: labelSchema })
	.strict()
	.refine((v) => v.local_part !== undefined || v.label !== undefined, {
		message: 'Nothing to update.'
	});

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

export const PATCH: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	assertAdmin(auth.member.role);

	const id = event.params.id;

	let body: unknown;
	try {
		body = await event.request.json();
	} catch {
		return json({ error: 'Invalid JSON.' }, { status: 400 });
	}

	const parsed = patchSchema.safeParse(body);
	if (!parsed.success) {
		const field_errors: Record<string, string> = {};
		for (const issue of parsed.error.issues) {
			const key = issue.path[0]?.toString();
			if (key) field_errors[key] = issue.message;
		}
		return json({ error: 'Unknown or invalid fields.', field_errors }, { status: 400 });
	}

	const [row] = await db
		.select({ id: emailSenderAddresses.id })
		.from(emailSenderAddresses)
		.where(and(eq(emailSenderAddresses.id, id), eq(emailSenderAddresses.org_id, auth.orgId)))
		.limit(1);
	if (!row) error(404, 'Address not found.');

	const changes: { local_part?: string; label?: string | null; updated_at: Date } = {
		updated_at: new Date()
	};

	if (parsed.data.local_part !== undefined) {
		const localPart = parsed.data.local_part;

		const [org] = await db
			.select({ slug: organizations.slug, email_sender_local: organizations.email_sender_local })
			.from(organizations)
			.where(eq(organizations.id, auth.orgId))
			.limit(1);
		if (!org) error(404, 'Organization not found.');

		if (localPart === defaultLocalPart(org)) {
			return json(
				{
					error: 'That is already your default address.',
					field_errors: { local_part: 'Already your default address.' }
				},
				{ status: 409 }
			);
		}

		// Collision with another extra address (exclude this row).
		const [clash] = await db
			.select({ id: emailSenderAddresses.id })
			.from(emailSenderAddresses)
			.where(
				and(
					eq(emailSenderAddresses.org_id, auth.orgId),
					eq(emailSenderAddresses.local_part, localPart),
					ne(emailSenderAddresses.id, id)
				)
			)
			.limit(1);
		if (clash) {
			return json(
				{
					error: 'You already have that address.',
					field_errors: { local_part: 'Address already exists.' }
				},
				{ status: 409 }
			);
		}

		changes.local_part = localPart;
	}

	if (parsed.data.label !== undefined) {
		changes.label = parsed.data.label || null;
	}

	await db
		.update(emailSenderAddresses)
		.set(changes)
		.where(and(eq(emailSenderAddresses.id, id), eq(emailSenderAddresses.org_id, auth.orgId)));

	const addresses = await listAddresses(auth.orgId);
	return json({ data: { addresses } });
};

export const DELETE: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	assertAdmin(auth.member.role);

	const id = event.params.id;

	const deleted = await db
		.delete(emailSenderAddresses)
		.where(and(eq(emailSenderAddresses.id, id), eq(emailSenderAddresses.org_id, auth.orgId)))
		.returning({ id: emailSenderAddresses.id });
	if (deleted.length === 0) error(404, 'Address not found.');

	const addresses = await listAddresses(auth.orgId);
	return json({ data: { addresses } });
};
