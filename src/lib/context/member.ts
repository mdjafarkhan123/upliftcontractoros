import { getContext, setContext } from 'svelte';
import type { OrgMember } from '$lib/types';

const MEMBER_KEY = Symbol('member');

export function setMemberContext(member: () => OrgMember): void {
	setContext(MEMBER_KEY, member);
}

export function getMemberContext(): () => OrgMember {
	const accessor = getContext<() => OrgMember>(MEMBER_KEY);
	if (!accessor) throw new Error('getMemberContext called outside (app) layout tree');
	return accessor;
}
