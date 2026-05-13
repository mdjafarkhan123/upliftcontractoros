import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { Org, OrgMember } from '$lib/types';

const ORG_SAFE_FIELDS = [
	'id', 'name', 'slug', 'trade_type', 'status', 'plan', 'logo_url', 'primary_color',
	'timezone', 'address', 'city', 'state', 'zip', 'is_setup_complete',
	'feature_overrides_updated_at', 'created_at'
] as const;

function pickSafeOrg(org: Org) {
	const out: Record<string, unknown> = {};
	for (const k of ORG_SAFE_FIELDS) out[k] = org[k];
	return out;
}

function pickSafeMember(m: OrgMember): Omit<OrgMember, never> {
	// All member fields are safe to send: ids, role, permission booleans, profile fields.
	return m;
}

export const GET: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	if (!auth) throw error(401, 'Unauthorized');

	return json({
		org: pickSafeOrg(auth.org),
		member: pickSafeMember(auth.member),
		featureFlags: auth.featureFlags,
		limits: auth.limits,
		integrationStatus: auth.integrationStatus
	});
};
