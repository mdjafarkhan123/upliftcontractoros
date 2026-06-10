import { json, error } from '@sveltejs/kit';
import { z } from 'zod';
import { and, eq, inArray } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { emailDomains, emailChangeRequests, outboxEvents } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';

// Stage 2 — contractor requests setup/change of their branded email sending domain.
// PO holds all contractor DNS, so this is request-to-PO (never self-service). On
// success we INSERT the request row + a `email_domain.change_requested` outbox event
// in one transaction; the outbox worker emails the PO. No external call here —
// Transaction Boundary Law. Mirrors /api/onboarding/carrier.
//
// Admin-only, matching the sibling /api/settings/email endpoint: there is no
// per-boolean permission for org email configuration; the whole settings area gates
// on role === 'admin'.
function assertAdmin(role: string): void {
	if (role !== 'admin') error(403, 'Admin only.');
}

// Bare root domain or subdomain: lowercase labels, hyphens allowed internally, at
// least one dot, no scheme/path. e.g. upliftcontractor.com, mail.acme.co.uk.
const DOMAIN_RE = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/;
const LOCAL_PART_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;

const requestSchema = z
	.object({
		desired_domain: z
			.string()
			.trim()
			.toLowerCase()
			.min(1, 'Required.')
			.max(253, 'Too long.')
			.regex(DOMAIN_RE, 'Enter a valid domain, e.g. yourcompany.com.'),
		desired_local_part: z
			.string()
			.trim()
			.toLowerCase()
			.max(64, 'Too long (max 64 characters).')
			.regex(
				LOCAL_PART_RE,
				'Use lowercase letters, numbers and hyphens only — no leading or trailing hyphen.'
			)
			.optional()
			.or(z.literal('')),
		note: z
			.string()
			.trim()
			.max(1000, 'Too long (max 1000 characters).')
			.optional()
			.or(z.literal(''))
	})
	.strict();

const OPEN_STATUSES = ['pending', 'in_review'] as const;

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

	const parsed = requestSchema.safeParse(body);
	if (!parsed.success) {
		const field_errors: Record<string, string> = {};
		for (const issue of parsed.error.issues) {
			const key = issue.path[0]?.toString();
			if (key && !field_errors[key]) field_errors[key] = issue.message;
		}
		return json({ error: 'Please fix the errors below.', field_errors }, { status: 400 });
	}

	const desired_domain = parsed.data.desired_domain;
	const desired_local_part = parsed.data.desired_local_part?.trim() || null;
	const note = parsed.data.note?.trim() || null;

	// One open request at a time — keep the PO queue clean and avoid duplicates.
	const [existingOpen] = await db
		.select({ id: emailChangeRequests.id })
		.from(emailChangeRequests)
		.where(
			and(
				eq(emailChangeRequests.org_id, auth.orgId),
				inArray(emailChangeRequests.status, [...OPEN_STATUSES])
			)
		)
		.limit(1);
	if (existingOpen) {
		return json(
			{ error: 'You already have a pending request. We will be in touch shortly.' },
			{ status: 409 }
		);
	}

	// new_domain vs change_domain depends on whether a domain row already exists.
	const [domainRow] = await db
		.select({ id: emailDomains.id })
		.from(emailDomains)
		.where(eq(emailDomains.org_id, auth.orgId))
		.limit(1);
	const request_type = domainRow ? 'change_domain' : 'new_domain';

	const requestId = await db.transaction(async (tx) => {
		const [row] = await tx
			.insert(emailChangeRequests)
			.values({
				org_id: auth.orgId,
				requested_by_member_id: auth.member.id,
				request_type,
				desired_domain,
				desired_local_part,
				note
			})
			.returning({ id: emailChangeRequests.id });

		await tx.insert(outboxEvents).values({
			org_id: auth.orgId,
			event_type: 'email_domain.change_requested',
			resource_type: 'email_change_request',
			resource_id: row.id,
			payload: {
				request_id: row.id,
				org_id: auth.orgId,
				org_name: auth.org.name,
				request_type,
				desired_domain,
				desired_local_part,
				note,
				requested_by: auth.member.full_name ?? auth.member.email ?? null
			},
			// Fresh per submission so each request notifies the PO.
			idempotency_key: `email_domain.change_requested:${row.id}`
		});

		return row.id;
	});

	console.log(
		JSON.stringify({
			level: 'info',
			event: 'settings.email.change_requested',
			request_id: crypto.randomUUID(),
			org_id: auth.orgId,
			member_id: auth.member.id,
			route: 'POST /api/settings/email/request',
			email_change_request_id: requestId,
			request_type
		})
	);

	return new Response(null, { status: 204 });
};
