import { redirect, error } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import type { Org, OrgMember } from '$lib/types';
import { resolveLogoUrl } from '$lib/server/media/resolveLogo';
import type { AppSessionData } from '$lib/stores/session.svelte';

// Framework-level hydration only: reuses event.locals.auth (already loaded
// by hooks.server.ts). No extra DB query, no feature query, no business
// data — just the session snapshot the client needs to mount the shell.
// All later refreshes (polling, mutation invalidation) still go through
// /api/session.

const ORG_SAFE_FIELDS = [
	'id',
	'name',
	'slug',
	'trade_type',
	'status',
	'plan',
	'logo_url',
	'primary_color',
	'timezone',
	'address',
	'city',
	'state',
	'zip',
	'is_setup_complete',
	'ghost_lead_days',
	'calendar_day_start_hour',
	'calendar_day_end_hour',
	// Target profit-margin floor — drives the green/amber/red signal on the internal
	// margin readout while quoting. Internal-only setting; never customer-facing.
	'target_margin_pct',
	// Invoice tips (M7): master toggle + percent presets. Client needs these to show the
	// tip field on the record-payment dialog and (via public projection) the pay page.
	'tips_enabled',
	'tip_preset_percents',
	// Invoice late fees (M8): master toggle + type + values. Client needs these to gate the
	// "Add late fee" action on overdue invoices and preview the fee.
	'late_fee_enabled',
	'late_fee_type',
	'late_fee_flat_amount',
	'late_fee_percent',
	'late_fee_grace_days',
	'feature_overrides_updated_at',
	'created_at'
] as const;

function pickSafeOrg(org: Org) {
	const out: Record<string, unknown> = {};
	for (const k of ORG_SAFE_FIELDS) out[k] = org[k];
	return out;
}

function pickSafeMember(m: OrgMember): OrgMember {
	return m;
}

export const load: LayoutServerLoad = async (event) => {
	const auth = event.locals.auth;
	if (!auth) throw redirect(302, '/auth/login');

	const safeOrg = pickSafeOrg(auth.org);
	safeOrg.logo_url = await resolveLogoUrl(auth.org.logo_url ?? null);

	const session: AppSessionData = {
		org: safeOrg as unknown as Org,
		member: pickSafeMember(auth.member),
		featureFlags: auth.featureFlags,
		limits: auth.limits,
		integrationStatus: auth.integrationStatus
	};

	return { session };
};
