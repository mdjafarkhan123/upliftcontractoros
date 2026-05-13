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

export type FeatureFlagKey = {
	[K in keyof Organization]: K extends `feature_${string}`
		? Organization[K] extends boolean
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
