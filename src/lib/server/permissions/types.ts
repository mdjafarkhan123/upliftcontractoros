import type { OrgMember } from '$lib/server/db/schema';

export type PermissionKey = {
	[K in keyof OrgMember]: K extends `can_${string}` ? K : never;
}[keyof OrgMember];
