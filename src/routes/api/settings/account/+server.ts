import { json, error } from '@sveltejs/kit';
import { z } from 'zod';
import { and, eq, isNull, ne, sql } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { orgMembers } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { createServiceClient } from '$lib/server/auth/supabase';

const accountPatchSchema = z
	.object({
		full_name: z.string().min(1).max(200).trim().optional(),
		email: z.string().email().toLowerCase().trim().optional()
	})
	.strict();

function logEvent(level: 'info' | 'error', event: string, ctx: Record<string, unknown>) {
	console.log(JSON.stringify({ level, event, ...ctx }));
}

export const GET: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);

	return json({
		data: {
			id: auth.member.id,
			full_name: auth.member.full_name,
			email: auth.member.email,
			role: auth.member.role,
			avatar_url: auth.member.avatar_url
		}
	});
};

export const PATCH: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);

	let body: unknown;
	try {
		body = await event.request.json();
	} catch {
		return json({ error: 'Invalid JSON.' }, { status: 400 });
	}

	const parsed = accountPatchSchema.safeParse(body);
	if (!parsed.success) {
		const field_errors: Record<string, string> = {};
		for (const issue of parsed.error.issues) {
			const key = issue.path[0]?.toString();
			if (key) field_errors[key] = issue.message;
		}
		return json({ error: 'Validation failed.', field_errors }, { status: 400 });
	}

	const { full_name, email } = parsed.data;
	const memberId = auth.member.id;
	const authUserId = auth.supabaseUser.id;
	const requestId = crypto.randomUUID();

	// 1) Name change is simple — no Auth coupling.
	if (full_name !== undefined && email === undefined) {
		const [updated] = await db
			.update(orgMembers)
			.set({ full_name, updated_at: new Date() })
			.where(eq(orgMembers.id, memberId))
			.returning({
				id: orgMembers.id,
				full_name: orgMembers.full_name,
				email: orgMembers.email,
				role: orgMembers.role,
				avatar_url: orgMembers.avatar_url
			});

		logEvent('info', 'settings.account.updated', {
			request_id: requestId,
			org_id: auth.orgId,
			member_id: memberId,
			route: 'PATCH /api/settings/account',
			changed_fields: ['full_name']
		});

		return json({ data: updated });
	}

	if (email === undefined && full_name === undefined) {
		return json({ error: 'No editable fields provided.' }, { status: 400 });
	}

	// 2) Email change (with optional name change in same call).
	const oldEmail = auth.member.email;

	if (email && email === oldEmail.toLowerCase()) {
		// No-op for email — but name may still change.
		if (full_name !== undefined) {
			const [updated] = await db
				.update(orgMembers)
				.set({ full_name, updated_at: new Date() })
				.where(eq(orgMembers.id, memberId))
				.returning({
					id: orgMembers.id,
					full_name: orgMembers.full_name,
					email: orgMembers.email,
					role: orgMembers.role,
					avatar_url: orgMembers.avatar_url
				});
			return json({ data: updated });
		}
		return new Response(null, { status: 204 });
	}

	// Uniqueness check within this org (case-insensitive).
	const [conflict] = await db
		.select({ id: orgMembers.id })
		.from(orgMembers)
		.where(
			and(
				eq(orgMembers.org_id, auth.orgId),
				ne(orgMembers.id, memberId),
				sql`lower(${orgMembers.email}) = ${email}`,
				isNull(orgMembers.deleted_at)
			)
		)
		.limit(1);

	if (conflict) {
		return json(
			{
				error: 'That email is already in use in this organization.',
				field_errors: { email: 'Already in use.' }
			},
			{ status: 409 }
		);
	}

	const supabase = createServiceClient();

	// Step A: update Supabase Auth email
	const { error: authErr } = await supabase.auth.admin.updateUserById(authUserId, {
		email: email!,
		email_confirm: true
	});
	if (authErr) {
		logEvent('error', 'settings.account.email_change.auth_failed', {
			request_id: requestId,
			org_id: auth.orgId,
			member_id: memberId,
			auth_user_id: authUserId,
			route: 'PATCH /api/settings/account',
			message: authErr.message
		});
		return json({ error: 'Could not update email. Please try again.' }, { status: 500 });
	}

	// Step B: update org_members
	try {
		const [updated] = await db
			.update(orgMembers)
			.set({
				email: email!,
				...(full_name !== undefined ? { full_name } : {}),
				updated_at: new Date()
			})
			.where(eq(orgMembers.id, memberId))
			.returning({
				id: orgMembers.id,
				full_name: orgMembers.full_name,
				email: orgMembers.email,
				role: orgMembers.role,
				avatar_url: orgMembers.avatar_url
			});

		logEvent('info', 'settings.account.email_changed', {
			request_id: requestId,
			org_id: auth.orgId,
			member_id: memberId,
			auth_user_id: authUserId,
			route: 'PATCH /api/settings/account'
		});

		return json({ data: updated });
	} catch (dbErr) {
		// Compensating rollback — revert Auth email.
		const { error: revertErr } = await supabase.auth.admin.updateUserById(authUserId, {
			email: oldEmail,
			email_confirm: true
		});
		if (revertErr) {
			logEvent('error', 'settings.account.email_change.rollback_failed', {
				request_id: requestId,
				org_id: auth.orgId,
				member_id: memberId,
				auth_user_id: authUserId,
				route: 'PATCH /api/settings/account',
				rollback_message: revertErr.message,
				db_message: dbErr instanceof Error ? dbErr.message : 'unknown'
			});
		} else {
			logEvent('error', 'settings.account.email_change.db_failed_rolled_back', {
				request_id: requestId,
				org_id: auth.orgId,
				member_id: memberId,
				auth_user_id: authUserId,
				route: 'PATCH /api/settings/account',
				db_message: dbErr instanceof Error ? dbErr.message : 'unknown'
			});
		}
		return json({ error: 'Could not save email change. Please try again.' }, { status: 500 });
	}
};
