import { getContext, setContext } from 'svelte';
import type { Org } from '$lib/types';

const ORG_KEY = Symbol('org');

export function setOrgContext(org: () => Org): void {
	setContext(ORG_KEY, org);
}

export function getOrgContext(): () => Org {
	const accessor = getContext<() => Org>(ORG_KEY);
	if (!accessor) throw new Error('getOrgContext called outside (app) layout tree');
	return accessor;
}
