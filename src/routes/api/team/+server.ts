import { json, error } from '@sveltejs/kit';
import { and, asc, count, desc, eq, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { orgMembers } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { createServiceClient } from '$lib/server/auth/supabase';
import {
	getTemplate,
	isKnownPermissionKey,
	ALL_PERMISSION_KEYS
} from '$lib/team/permissions-config';
import type { PermissionValues } from '$lib/team/permissions-config';
import type { PermissionKey } from '$lib/types';

const createSchema = z.object({
	full_name: z.string().min(1).max(200).trim(),
	email: z.string().email().toLowerCase().trim(),
	password: z.string().min(8),
	role: z.enum(['manager', 'member'])
});

function logCleanupFailure(context: {
	org_id: string;
	auth_user_id: string;
	email: string;
	step: string;
	error: unknown;
}) {
	console.error(
		JSON.stringify({
			level: 'error',
			event: 'team.member.create.cleanup_failed',
			org_id: context.org_id,
			auth_user_id: context.auth_user_id,
			email: context.email,
			step: context.step,
			message: context.error instanceof Error ? context.error.message : String(context.error)
		})
	);
}

export const GET: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!auth.member.can_view_team_members) error(403, 'Forbidden');

	const includeInactive = event.url.searchParams.get('inactive') === '1';

	const conditions = [eq(orgMembers.org_id, auth.orgId), isNull(orgMembers.deleted_at)];
	if (!includeInactive) conditions.push(eq(orgMembers.is_active, true));

	const members = await db
		.select({
			id: orgMembers.id,
			full_name: orgMembers.full_name,
			email: orgMembers.email,
			role: orgMembers.role,
			is_active: orgMembers.is_active,
			created_at: orgMembers.created_at
		})
		.from(orgMembers)
		.where(and(...conditions))
		.orderBy(
			desc(orgMembers.is_active),
			sql`CASE ${orgMembers.role} WHEN 'admin' THEN 0 WHEN 'manager' THEN 1 ELSE 2 END`,
			asc(orgMembers.full_name)
		);

	return json({ data: members });
};

export const POST: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!auth.member.can_create_team_members) error(403, 'Forbidden');

	let body: Record<string, unknown>;
	try {
		body = (await event.request.json()) as Record<string, unknown>;
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
		return json({ error: 'Validation failed.', field_errors }, { status: 400 });
	}

	const { full_name, email, password, role } = parsed.data;

	// Check plan limit
	const [{ value: memberCount }] = await db
		.select({ value: count() })
		.from(orgMembers)
		.where(
			and(
				eq(orgMembers.org_id, auth.orgId),
				eq(orgMembers.is_active, true),
				isNull(orgMembers.deleted_at)
			)
		);

	if (memberCount >= auth.limits.max_team_members) {
		return json(
			{ error: `Team member limit of ${auth.limits.max_team_members} reached.` },
			{ status: 422 }
		);
	}

	// Pre-check: case-insensitive email match within this org
	const [existing] = await db
		.select({ id: orgMembers.id })
		.from(orgMembers)
		.where(
			and(
				eq(orgMembers.org_id, auth.orgId),
				sql`lower(${orgMembers.email}) = ${email}`,
				isNull(orgMembers.deleted_at)
			)
		)
		.limit(1);

	if (existing) {
		return json({ error: 'A team member with this email already exists.' }, { status: 409 });
	}

	// Build final permissions: start from template, overlay any valid overrides from body
	const finalPermissions: PermissionValues = getTemplate(role);
	const permErrors: Record<string, string> = {};

	for (const key of Object.keys(body)) {
		if (['full_name', 'email', 'password', 'role'].includes(key)) continue;
		if (!isKnownPermissionKey(key)) {
			permErrors[key] = 'Unknown field';
			continue;
		}
		const val = body[key];
		if (typeof val !== 'boolean') {
			permErrors[key] = 'Must be true or false';
		} else {
			finalPermissions[key as PermissionKey] = val;
		}
	}

	if (Object.keys(permErrors).length > 0) {
		return json({ error: 'Validation failed.', field_errors: permErrors }, { status: 400 });
	}

	const supabase = createServiceClient();

	// Step 1: Create auth user
	let authUserId: string | null = null;
	let isRecoveredOrphan = false;

	const { data: createData, error: createError } = await supabase.auth.admin.createUser({
		email,
		password,
		email_confirm: true
	});

	if (createError) {
		const msg = createError.message?.toLowerCase() ?? '';
		if (
			msg.includes('already been registered') ||
			msg.includes('already exists') ||
			msg.includes('unique constraint')
		) {
			// Auth user exists — check if it's an orphan (no org_members row)
			const { data: listData } = await supabase.auth.admin.listUsers();
			const orphanUser = listData?.users?.find(
				(u) => u.email?.toLowerCase() === email.toLowerCase()
			);

			if (!orphanUser) {
				return json({ error: 'Unable to create account. Please try again.' }, { status: 500 });
			}

			// Check if this auth user already has an org_members row in this org
			const [orphanMember] = await db
				.select({ id: orgMembers.id })
				.from(orgMembers)
				.where(
					and(
						eq(orgMembers.org_id, auth.orgId),
						eq(orgMembers.supabase_user_id, orphanUser.id),
						isNull(orgMembers.deleted_at)
					)
				)
				.limit(1);

			if (orphanMember) {
				return json({ error: 'A team member with this email already exists.' }, { status: 409 });
			}

			authUserId = orphanUser.id;
			isRecoveredOrphan = true;
		} else {
			console.error(
				JSON.stringify({
					level: 'error',
					event: 'team.member.create.supabase_error',
					org_id: auth.orgId,
					email,
					message: createError.message
				})
			);
			return json({ error: 'Failed to create account. Please try again.' }, { status: 500 });
		}
	} else {
		authUserId = createData.user.id;
	}

	if (!authUserId) {
		return json({ error: 'Failed to create account.' }, { status: 500 });
	}

	// Step 2: Set app_metadata
	const { error: metaError } = await supabase.auth.admin.updateUserById(authUserId, {
		app_metadata: { org_id: auth.orgId, role, password_changed: false }
	});

	if (metaError) {
		if (!isRecoveredOrphan) {
			await supabase.auth.admin.deleteUser(authUserId).catch((e) => {
				logCleanupFailure({
					org_id: auth.orgId,
					auth_user_id: authUserId!,
					email,
					step: 'deleteUser_after_metadata_failure',
					error: e
				});
			});
		}
		return json({ error: 'Failed to configure account. Please try again.' }, { status: 500 });
	}

	// Step 3: Insert org_members row
	try {
		const [created] = await db
			.insert(orgMembers)
			.values({
				org_id: auth.orgId,
				supabase_user_id: authUserId,
				email,
				full_name,
				role,
				is_active: true,
				...finalPermissions
			})
			.returning({
				id: orgMembers.id,
				full_name: orgMembers.full_name,
				email: orgMembers.email,
				role: orgMembers.role,
				is_active: orgMembers.is_active,
				created_at: orgMembers.created_at
			});

		return json({ data: created }, { status: 201 });
	} catch (insertErr) {
		if (!isRecoveredOrphan) {
			await supabase.auth.admin.deleteUser(authUserId).catch((e) => {
				logCleanupFailure({
					org_id: auth.orgId,
					auth_user_id: authUserId!,
					email,
					step: 'deleteUser_after_insert_failure',
					error: e
				});
			});
		}
		logCleanupFailure({
			org_id: auth.orgId,
			auth_user_id: authUserId,
			email,
			step: 'insert_org_members',
			error: insertErr
		});
		return json({ error: 'Failed to save team member. Please try again.' }, { status: 500 });
	}
};
