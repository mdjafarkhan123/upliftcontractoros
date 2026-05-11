import type { OrgMember, PermissionKey } from '$lib/types';

export function can(member: OrgMember, key: PermissionKey): boolean {
	return member[key] === true;
}

export function canAny(member: OrgMember, keys: PermissionKey[]): boolean {
	return keys.some((k) => member[k] === true);
}
