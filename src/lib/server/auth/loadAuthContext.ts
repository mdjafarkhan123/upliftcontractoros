import { and, eq, isNull } from 'drizzle-orm';
import type { User } from '@supabase/supabase-js';
import { db } from '$lib/server/db/client';
import { orgMembers, organizations } from '$lib/server/db/schema';
import type {
	Org,
	OrgMember,
	FeatureFlags,
	OrgLimits,
	IntegrationStatus,
	FeatureFlagKey,
	LimitKey
} from '$lib/types';

export type AuthContext = {
	supabaseUser: User;
	member: OrgMember;
	org: Org;
	orgId: string;
	permissions: OrgMember;
	featureFlags: FeatureFlags;
	limits: OrgLimits;
	integrationStatus: IntegrationStatus;
	orgStatus: Org['status'];
	featureOverridesUpdatedAt: Date | null;
};

const FEATURE_KEYS: FeatureFlagKey[] = [
	'feature_one_way_sms',
	'feature_two_way_sms',
	'feature_bulk_sms',
	'feature_conversations',
	'feature_missed_call_textback',
	'feature_team_management',
	'feature_appointments',
	'feature_media_uploads',
	'feature_automation_engine',
	'feature_review_funnel',
	'feature_appointment_reminders',
	'feature_invoice_reminders',
	'feature_financial_tools',
	'feature_stripe_payments',
	'feature_messenger',
	'feature_growth_feed',
	'feature_advanced_reporting',
	'feature_ai_assistant',
	'feature_custom_branding',
	'feature_api_access',
	'feature_webhooks',
	'feature_client_portal',
	'feature_online_booking'
];

const LIMIT_KEYS: LimitKey[] = [
	'max_team_members',
	'max_monthly_sms',
	'max_bulk_sms_per_day',
	'max_ai_requests_per_month',
	'max_storage_gb',
	'max_automation_workflows'
];

function pickFeatureFlags(org: Org): FeatureFlags {
	const out = {} as FeatureFlags;
	for (const k of FEATURE_KEYS) (out as Record<string, unknown>)[k] = org[k];
	return out;
}

function pickLimits(org: Org): OrgLimits {
	const out = {} as OrgLimits;
	for (const k of LIMIT_KEYS) (out as Record<string, unknown>)[k] = org[k];
	return out;
}

// Per-process cache of the member+org row, keyed by Supabase user id. Skips the
// DB round trip the hooks pay on every authed request. Staleness window is 15s —
// permission/feature/suspension changes lag at most that long (the client status
// poll is 20 minutes, so this is not the bottleneck). Negative lookups are never
// cached so a just-created member is usable immediately.
const AUTH_CACHE_TTL_MS = 15_000;
const AUTH_CACHE_MAX_ENTRIES = 5_000;
const authRowCache = new Map<string, { member: OrgMember; org: Org; expiresAt: number }>();

export function invalidateAuthContextCache(supabaseUserId: string): void {
	authRowCache.delete(supabaseUserId);
}

export async function loadAuthContext(user: User): Promise<AuthContext | null> {
	let member: OrgMember;
	let org: Org;

	const cached = authRowCache.get(user.id);
	if (cached && cached.expiresAt > Date.now()) {
		({ member, org } = cached);
	} else {
		const [row] = await db
			.select({ member: orgMembers, org: organizations })
			.from(orgMembers)
			.innerJoin(organizations, eq(organizations.id, orgMembers.org_id))
			.where(
				and(
					eq(orgMembers.supabase_user_id, user.id),
					eq(orgMembers.is_active, true),
					isNull(orgMembers.deleted_at)
				)
			)
			.limit(1);

		if (!row) {
			authRowCache.delete(user.id);
			return null;
		}

		({ member, org } = row);
		if (authRowCache.size >= AUTH_CACHE_MAX_ENTRIES) {
			const oldestKey = authRowCache.keys().next().value;
			if (oldestKey) authRowCache.delete(oldestKey);
		}
		authRowCache.set(user.id, { member, org, expiresAt: Date.now() + AUTH_CACHE_TTL_MS });
	}

	return {
		supabaseUser: user,
		member,
		org,
		orgId: org.id,
		permissions: member,
		featureFlags: pickFeatureFlags(org),
		limits: pickLimits(org),
		integrationStatus: (org.integration_status ?? {}) as IntegrationStatus,
		orgStatus: org.status,
		featureOverridesUpdatedAt: org.feature_overrides_updated_at
	};
}
