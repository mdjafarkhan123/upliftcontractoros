import { json, error } from '@sveltejs/kit';
import { eq, and, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { emailDomains, messages, outboxEvents } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { generateForwardTestToken } from '$lib/server/email/forwardingVerification';

// Email forwarding setup is admin-only, matching the sibling /api/settings/email
// endpoints. There is no per-boolean permission for org configuration; the whole
// settings area gates on role === 'admin'.
function assertAdmin(role: string): void {
	if (role !== 'admin') error(403, 'Admin only.');
}

// A 'pending' verification older than this is surfaced to the UI as 'expired' so the
// contractor knows it didn't come back and can retry. The stored status stays
// 'pending' — expiry is purely a derived/display state.
const FORWARD_TEST_EXPIRY_MS = 15 * 60 * 1000;

type ForwardTestState = {
	// 'pending' = sent, waiting for round-trip | 'passed' = returned & matched |
	// 'expired' = pending too long | null = never run.
	status: 'pending' | 'passed' | 'expired' | null;
	// The inbox the verification email was sent to.
	email: string | null;
	sent_at: string | null;
	verified_at: string | null;
};

type ForwardingState = {
	// inbox@<inbound_domain>, e.g. inbox@replies.acme.com. Null until the org has a
	// VERIFIED receiving domain — Brevo only parses inbound mail on a verified
	// inbound_domain, so handing out the address before then would silently drop mail.
	forwarding_address: string | null;
	// Status of the org's email_domains row, or null when none exists yet (the
	// "request your branded domain" empty-state).
	domain_status: 'pending' | 'verifying' | 'verified' | 'failed' | null;
	// Health summary, derived from captured inbound email.
	last_email_received_at: string | null;
	captured_this_week: number;
	// Forwarding round-trip verification (Stage 1.3).
	forward_test: ForwardTestState;
	// One consolidated "is forwarding working right now?" signal (Stage 4). Null when
	// the org has no verified receiving domain — the UI shows the request flow instead,
	// so there is nothing to report on. 'active' = mail confirmed flowing,
	// 'needs_attention' = a test was run but never came back, 'idle' = set up but quiet.
	health: 'active' | 'idle' | 'needs_attention' | null;
};

// Roll the separate signals (verified domain, round-trip test, recent captures) into a
// single status the contractor can read at a glance. Real captured mail outranks a stale
// test result — if email is arriving, forwarding is working regardless of the last test.
function computeHealth(
	forwardingAddress: string | null,
	test: ForwardTestState,
	capturedThisWeek: number
): ForwardingState['health'] {
	if (!forwardingAddress) return null;
	if (capturedThisWeek > 0 || test.status === 'passed') return 'active';
	if (test.status === 'expired') return 'needs_attention';
	return 'idle';
}

type DomainRow = {
	inbound_domain: string;
	status: 'pending' | 'verifying' | 'verified' | 'failed';
	forward_test_status: string | null;
	forward_test_email: string | null;
	forward_test_sent_at: Date | null;
	forward_test_verified_at: Date | null;
};

function toForwardTestState(row: DomainRow | undefined): ForwardTestState {
	if (!row || !row.forward_test_status) {
		return { status: null, email: null, sent_at: null, verified_at: null };
	}
	let status: ForwardTestState['status'] =
		row.forward_test_status === 'passed' ? 'passed' : 'pending';
	if (
		status === 'pending' &&
		row.forward_test_sent_at &&
		Date.now() - row.forward_test_sent_at.getTime() > FORWARD_TEST_EXPIRY_MS
	) {
		status = 'expired';
	}
	return {
		status,
		email: row.forward_test_email,
		sent_at: row.forward_test_sent_at?.toISOString() ?? null,
		verified_at: row.forward_test_verified_at?.toISOString() ?? null
	};
}

async function loadState(orgId: string): Promise<ForwardingState> {
	const [domainRow] = await db
		.select({
			inbound_domain: emailDomains.inbound_domain,
			status: emailDomains.status,
			forward_test_status: emailDomains.forward_test_status,
			forward_test_email: emailDomains.forward_test_email,
			forward_test_sent_at: emailDomains.forward_test_sent_at,
			forward_test_verified_at: emailDomains.forward_test_verified_at
		})
		.from(emailDomains)
		.where(eq(emailDomains.org_id, orgId))
		.limit(1);

	const [stats] = await db
		.select({
			last_received: sql<string | null>`max(${messages.created_at})`,
			captured_this_week: sql<number>`cast(count(*) filter (where ${messages.created_at} >= now() - interval '7 days') as int)`
		})
		.from(messages)
		.where(
			and(
				eq(messages.org_id, orgId),
				eq(messages.channel, 'email'),
				eq(messages.direction, 'inbound')
			)
		);

	const forwarding_address =
		domainRow && domainRow.status === 'verified' ? `inbox@${domainRow.inbound_domain}` : null;
	const forward_test = toForwardTestState(domainRow);
	const captured_this_week = stats?.captured_this_week ?? 0;

	return {
		forwarding_address,
		domain_status: domainRow?.status ?? null,
		last_email_received_at: stats?.last_received ?? null,
		captured_this_week,
		forward_test,
		health: computeHealth(forwarding_address, forward_test, captured_this_week)
	};
}

export const GET: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	assertAdmin(auth.member.role);

	return json({ data: await loadState(auth.orgId) });
};

const testSchema = z.object({
	email: z.string().trim().email('Enter a valid email address.')
});

// Send a forwarding verification email to the contractor's own inbox. The send
// itself runs in the outbox worker (Rule 8/11) — here we only stamp the test row
// and enqueue the event, inside one transaction.
export const POST: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	assertAdmin(auth.member.role);

	const orgId = auth.orgId;

	const parsed = testSchema.safeParse(await event.request.json().catch(() => null));
	if (!parsed.success) {
		const field_errors: Record<string, string> = {};
		for (const issue of parsed.error.issues) {
			if (issue.path[0]) field_errors[String(issue.path[0])] = issue.message;
		}
		return json({ error: 'Invalid request.', field_errors }, { status: 400 });
	}
	const targetEmail = parsed.data.email.toLowerCase();

	const [domainRow] = await db
		.select({ status: emailDomains.status })
		.from(emailDomains)
		.where(eq(emailDomains.org_id, orgId))
		.limit(1);

	if (!domainRow || domainRow.status !== 'verified') {
		return json(
			{ error: 'Set up and verify your branded email domain before testing forwarding.' },
			{ status: 400 }
		);
	}

	const token = generateForwardTestToken();

	await db.transaction(async (tx) => {
		await tx
			.update(emailDomains)
			.set({
				forward_test_token: token,
				forward_test_email: targetEmail,
				forward_test_status: 'pending',
				forward_test_sent_at: new Date(),
				forward_test_verified_at: null,
				updated_at: new Date()
			})
			.where(eq(emailDomains.org_id, orgId));

		await tx.insert(outboxEvents).values({
			org_id: orgId,
			event_type: 'email_domain.forward_test_requested',
			resource_type: 'email_domain',
			resource_id: orgId,
			payload: {
				org_id: orgId,
				org_name: auth.org.name,
				target_email: targetEmail,
				token
			},
			idempotency_key: `email_domain.forward_test:${token}`
		});
	});

	return json({ data: await loadState(orgId) });
};
