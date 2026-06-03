export type {
	Organization as Org,
	OrgMember,
	NewOrganization,
	NewOrgMember
} from '$lib/server/db/schema/01_org_identity';

export type { IntegrationStatus } from '$lib/server/db/schema/01_org_identity';

import type { Organization, OrgMember } from '$lib/server/db/schema/01_org_identity';

export type PermissionKey = {
	[K in keyof OrgMember]: K extends `can_${string}` ? K : never;
}[keyof OrgMember];

// Includes both `feature_*` capability flags AND `*_sms_allowed` channel
// allowances (jafar layer for SMS gating per automation). Both are treated
// uniformly by the /jafar UI and plan template seeding.
export type FeatureFlagKey = {
	[K in keyof Organization]: Organization[K] extends boolean
		? K extends `feature_${string}`
			? K
			: K extends `${string}_sms_allowed`
				? K
				: never
		: never;
}[keyof Organization];

export type LimitKey = {
	[K in keyof Organization]: K extends `max_${string}`
		? Organization[K] extends number
			? K
			: never
		: never;
}[keyof Organization];

export type FeatureFlags = Pick<Organization, FeatureFlagKey>;
export type OrgLimits = Pick<Organization, LimitKey>;
