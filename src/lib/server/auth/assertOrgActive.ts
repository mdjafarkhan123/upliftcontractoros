import { error } from '@sveltejs/kit';
import type { AuthContext } from './loadAuthContext';

export function assertOrgActive(auth: AuthContext | null | undefined): asserts auth is AuthContext {
	if (!auth) error(401, 'Not authenticated.');
	if (!auth.member.is_active) error(403, 'Member is inactive.');
	if (auth.orgStatus === 'suspended') error(403, 'Organization is suspended.');
	if (auth.orgStatus === 'pending_deletion' || auth.orgStatus === 'deleted') {
		error(403, 'Organization is not active.');
	}
}
