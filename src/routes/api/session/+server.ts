import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { Org, OrgMember } from '$lib/types';
import { resolveLogoUrl } from '$lib/server/media/resolveLogo';

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
	// SMS activation state — drives the app-shell SMS status banner (Onboarding.md
	// Parts 4 & 6) and SMS UI visibility. twilio_phone_number is the org's own number.
	// country drives the Settings → Integrations SMS card (Part 7) availability copy.
	'sms_enabled',
	'sms_approval_status',
	'twilio_phone_number',
	'country',
	// Carrier registration (US 10DLC / CA CWTA) data — lets Settings → Integrations
	// (Onboarding.md Part 7) tell "skipped" from "submitted" and prefill the
	// fill-it-later form, and drives the carrier-incomplete app-shell banner. This is
	// the admin's own org data.
	'legal_business_name',
	'ein',
	'website',
	'messaging_use_case',
	'business_number',
	'calendar_day_start_hour',
	'calendar_day_end_hour',
	// Target profit-margin floor — drives the green/yellow/red signal on the internal
	// margin readout while quoting. Internal-only setting; never customer-facing.
	'target_margin_pct',
	// Invoice tips (M7): master toggle + percent presets (see (app)/+layout.server.ts).
	'tips_enabled',
	'tip_preset_percents',
	// Invoice late fees (M8): master toggle + type + values (see (app)/+layout.server.ts).
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

function pickSafeMember(m: OrgMember): Omit<OrgMember, never> {
	// All member fields are safe to send: ids, role, permission booleans, profile fields.
	return m;
}

export const GET: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	if (!auth) throw error(401, 'Unauthorized');

	const safeOrg = pickSafeOrg(auth.org);
	safeOrg.logo_url = await resolveLogoUrl(auth.org.logo_url ?? null);

	return json({
		org: safeOrg,
		member: pickSafeMember(auth.member),
		featureFlags: auth.featureFlags,
		limits: auth.limits,
		integrationStatus: auth.integrationStatus
	});
};
