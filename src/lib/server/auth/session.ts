import { and, eq, isNull } from 'drizzle-orm';
import type { RequestEvent } from '@sveltejs/kit';
import type { User } from '@supabase/supabase-js';
import { db } from '$lib/server/db/client';
import { orgMembers } from '$lib/server/db/schema';
import type { OrgMember } from '$lib/server/db/schema';
import { createServerClient } from './supabase';

export type ContractorSession = {
	supabaseUser: User;
	member: OrgMember;
	orgId: string;
};

export async function getContractorSession(event: RequestEvent): Promise<ContractorSession | null> {
	const supabase = createServerClient(event);

	const {
		data: { session }
	} = await supabase.auth.getSession();
	if (!session) return null;

	// safeGetSession: validate the JWT server-side — getUser() makes a network round-trip
	// to Supabase auth server, preventing forged or expired tokens from passing
	const {
		data: { user },
		error
	} = await supabase.auth.getUser();
	if (error || !user) return null;

	const [member] = await db
		.select()
		.from(orgMembers)
		.where(
			and(
				eq(orgMembers.supabase_user_id, user.id),
				eq(orgMembers.is_active, true),
				isNull(orgMembers.deleted_at)
			)
		)
		.limit(1);

	if (!member) return null;

	return { supabaseUser: user, member, orgId: member.org_id };
}
