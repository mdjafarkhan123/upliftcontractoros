import { and, eq, isNull } from 'drizzle-orm';
import type { User } from '@supabase/supabase-js';
import { db } from '$lib/server/db/client';
import { orgMembers, organizations } from '$lib/server/db/schema';
import type { Org, OrgMember, FeatureFlags, OrgLimits, IntegrationStatus, FeatureFlagKey, LimitKey } from '$lib/types';

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
	'feature_one_way_sms', 'feature_two_way_sms', 'feature_bulk_sms', 'feature_conversations',
	'feature_missed_call_textback', 'feature_team_management', 'feature_appointments',
	'feature_media_uploads', 'feature_automation_engine', 'feature_review_funnel',
	'feature_appointment_reminders', 'feature_invoice_reminders', 'feature_financial_tools',
	'feature_stripe_payments', 'feature_growth_feed', 'feature_advanced_reporting',
	'feature_ai_assistant', 'feature_custom_branding', 'feature_api_access',
	'feature_webhooks', 'feature_client_portal'
];

const LIMIT_KEYS: LimitKey[] = [
	'max_team_members', 'max_monthly_sms', 'max_bulk_sms_per_day',
	'max_ai_requests_per_month', 'max_storage_gb', 'max_automation_workflows'
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

export async function loadAuthContext(user: User): Promise<AuthContext | null> {
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

	if (!row) return null;

	const { member, org } = row;

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
