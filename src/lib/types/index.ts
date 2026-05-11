export type {
	Organization as Org,
	OrgMember,
	NewOrganization,
	NewOrgMember
} from '$lib/server/db/schema/01_org_identity';

import type { OrgMember } from '$lib/server/db/schema/01_org_identity';

export type PermissionKey = {
	[K in keyof OrgMember]: K extends `can_${string}` ? K : never;
}[keyof OrgMember];
