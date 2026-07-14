import type { OrgMember, FeatureFlags, PermissionKey } from '$lib/types';
import { can, canAny } from './can';
import { featureForNavKey } from './featureMap';

export type NavItem = {
	key: string;
	label: string;
	href: string;
	icon: string;
};

type NavDef = {
	key: string;
	label: string;
	href: string;
	icon: string;
	permissions: PermissionKey[];
};

const NAV_DEFS: NavDef[] = [
	{
		key: 'dashboard',
		label: 'Dashboard',
		href: '/dashboard',
		icon: 'ri-layout-grid-line',
		permissions: ['can_view_dashboard']
	},
	{
		key: 'inbox',
		label: 'Inbox',
		href: '/inbox',
		icon: 'ri-inbox-2-line',
		permissions: ['can_view_all_conversations', 'can_view_assigned_conversations']
	},
	{
		key: 'contacts',
		label: 'Contacts',
		href: '/contacts',
		icon: 'ri-group-line',
		permissions: ['can_view_all_contacts']
	},
	{
		key: 'pipeline',
		label: 'Pipeline',
		href: '/pipeline',
		icon: 'ri-git-branch-line',
		permissions: ['can_view_full_pipeline', 'can_view_assigned_opportunities']
	},
	{
		key: 'jobs',
		label: 'Jobs',
		href: '/jobs',
		icon: 'ri-briefcase-line',
		permissions: ['can_view_full_pipeline', 'can_view_assigned_jobs']
	},
	{
		key: 'quotes',
		label: 'Quotes',
		href: '/quotes',
		icon: 'ri-file-text-line',
		permissions: ['can_view_all_quotes']
	},
	{
		key: 'invoices',
		label: 'Invoices',
		href: '/invoices',
		icon: 'ri-receipt-line',
		permissions: ['can_view_all_invoices']
	},
	{
		key: 'appointments',
		label: 'Schedule',
		href: '/appointments',
		icon: 'ri-calendar-line',
		permissions: ['can_view_all_appointments', 'can_view_assigned_appointments']
	},
	{
		key: 'reputation',
		label: 'Reputation',
		href: '/reputation',
		icon: 'ri-star-line',
		permissions: ['can_view_reviews']
	},
	{
		key: 'growth',
		label: 'Growth Feed',
		href: '/growth',
		icon: 'ri-trending-up-line',
		permissions: ['can_view_growth_feed']
	}
];

export function buildVisibleNav(member: OrgMember, features?: FeatureFlags): NavItem[] {
	const items: NavItem[] = [];
	for (const def of NAV_DEFS) {
		const permitted =
			def.permissions.length === 1
				? can(member, def.permissions[0])
				: canAny(member, def.permissions);
		if (!permitted) continue;
		const requiredFeature = featureForNavKey(def.key);
		if (requiredFeature && features && !features[requiredFeature]) continue;
		items.push({ key: def.key, label: def.label, href: def.href, icon: def.icon });
	}
	return items;
}

/**
 * Mobile bottom nav: up to 4 primary visible items + a "More" tab.
 * Primary order tries Dashboard, Inbox, Contacts, Pipeline. If any are hidden
 * by permissions, the next available secondary item gets promoted so the bar
 * always feels full when there are enough items.
 */
export function splitForMobile(items: NavItem[]): { primary: NavItem[]; secondary: NavItem[] } {
	const PRIMARY_KEYS = ['dashboard', 'inbox', 'contacts', 'pipeline'];
	const primaryPreferred = items.filter((i) => PRIMARY_KEYS.includes(i.key));
	const rest = items.filter((i) => !PRIMARY_KEYS.includes(i.key));

	const targetPrimaryCount = Math.min(4, items.length);
	const primary = [...primaryPreferred];
	while (primary.length < targetPrimaryCount && rest.length > 0) {
		primary.push(rest.shift()!);
	}
	return { primary, secondary: rest };
}

export const SETTINGS_NAV: NavItem = {
	key: 'settings',
	label: 'Settings',
	href: '/settings',
	icon: 'ri-settings-3-line'
};

export const MORE_ITEM: NavItem = {
	key: 'more',
	label: 'More',
	href: '#more',
	icon: 'ri-more-2-fill'
};
