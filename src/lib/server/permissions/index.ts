import { and, eq, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import { orgMembers } from '$lib/server/db/schema';
import type { OrgMember } from '$lib/server/db/schema';
import type { PermissionKey } from './types';

export type { PermissionKey };

export async function getMemberPermissions(memberId: string): Promise<OrgMember | null> {
	const [member] = await db
		.select()
		.from(orgMembers)
		.where(and(eq(orgMembers.id, memberId), eq(orgMembers.is_active, true), isNull(orgMembers.deleted_at)))
		.limit(1);
	return member ?? null;
}

export async function checkPermission(
	memberId: string,
	permission: PermissionKey
): Promise<boolean> {
	const member = await getMemberPermissions(memberId);
	if (!member) return false;
	return member[permission] === true;
}
