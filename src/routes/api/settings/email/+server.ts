import { json, error } from '@sveltejs/kit';
import { z } from 'zod';
import { eq, and, inArray, asc } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import {
	organizations,
	emailDomains,
	emailChangeRequests,
	emailSenderAddresses
} from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { contractorFromAddress } from '$lib/server/email/senderAddresses';

// Org-level email identity is admin-only, matching the sibling /api/settings/org
// endpoint. There is no per-boolean permission for org configuration; the whole
// settings area gates on role === 'admin'.
function assertAdmin(role: string): void {
	if (role !== 'admin') error(403, 'Admin only.');
}

// Local-part of the From address. Lowercase letters, digits and single hyphens,
// no leading/trailing hyphen. Kept in lock-step with the localPart() sanitizer in
// senderAddresses.ts so what the contractor saves is exactly what is sent.
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

const patchSchema = z.object({ email_sender_local: localPartSchema }).strict();

type EmailIdentity = {
	from_name: string;
	slug: string;
	email_sender_local: string | null;
	domain: {
		sending_domain: string;
		status: 'pending' | 'verifying' | 'verified' | 'failed';
		from_address: string;
	} | null;
	// Extra branded From-addresses on the verified domain (the default lives in
	// email_sender_local above, never in this list).
	addresses: { id: string; local_part: string; label: string | null }[];
	has_open_request: boolean;
};

async function loadIdentity(orgId: string): Promise<EmailIdentity | null> {
	const [org] = await db
		.select({
			name: organizations.name,
			slug: organizations.slug,
			email_sender_local: organizations.email_sender_local
		})
		.from(organizations)
		.where(eq(organizations.id, orgId))
		.limit(1);

	if (!org) return null;

	const [domainRow] = await db
		.select({ domain: emailDomains.domain, status: emailDomains.status })
		.from(emailDomains)
		.where(eq(emailDomains.org_id, orgId))
		.limit(1);

	const addressRows = await db
		.select({
			id: emailSenderAddresses.id,
			local_part: emailSenderAddresses.local_part,
			label: emailSenderAddresses.label
		})
		.from(emailSenderAddresses)
		.where(eq(emailSenderAddresses.org_id, orgId))
		.orderBy(asc(emailSenderAddresses.created_at));

	const [openRequest] = await db
		.select({ id: emailChangeRequests.id })
		.from(emailChangeRequests)
		.where(
			and(
				eq(emailChangeRequests.org_id, orgId),
				inArray(emailChangeRequests.status, ['pending', 'in_review'])
			)
		)
		.limit(1);

	return {
		from_name: org.name,
		slug: org.slug,
		email_sender_local: org.email_sender_local,
		domain: domainRow
			? {
					sending_domain: domainRow.domain,
					status: domainRow.status,
					from_address: contractorFromAddress(org, domainRow.domain)
				}
			: null,
		addresses: addressRows,
		has_open_request: Boolean(openRequest)
	};
}

export const GET: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	assertAdmin(auth.member.role);

	const identity = await loadIdentity(auth.orgId);
	if (!identity) error(404, 'Organization not found.');

	return json({ data: identity });
};

export const PATCH: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	assertAdmin(auth.member.role);

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

	const [updated] = await db
		.update(organizations)
		.set({ email_sender_local: parsed.data.email_sender_local, updated_at: new Date() })
		.where(eq(organizations.id, auth.orgId))
		.returning({ id: organizations.id });

	if (!updated) error(404, 'Organization not found.');

	console.log(
		JSON.stringify({
			level: 'info',
			event: 'settings.email.updated',
			request_id: crypto.randomUUID(),
			org_id: auth.orgId,
			member_id: auth.member.id,
			route: 'PATCH /api/settings/email',
			changed_fields: ['email_sender_local']
		})
	);

	const identity = await loadIdentity(auth.orgId);
	if (!identity) error(404, 'Organization not found.');

	return json({ data: identity });
};
