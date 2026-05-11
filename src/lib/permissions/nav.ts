import type { Component } from 'svelte';
import {
	LayoutDashboard,
	Inbox,
	Users,
	GitBranch,
	Briefcase,
	FileText,
	Receipt,
	Calendar,
	Star,
	TrendingUp,
	Settings,
	MoreHorizontal
} from '@lucide/svelte';
import type { OrgMember } from '$lib/types';
import { can, canAny } from './can';

export type NavItem = {
	key: string;
	label: string;
	href: string;
	icon: Component;
};

export function buildVisibleNav(member: OrgMember): NavItem[] {
	const items: NavItem[] = [];

	if (can(member, 'can_view_dashboard')) {
		items.push({ key: 'dashboard', label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard });
	}

	if (canAny(member, ['can_view_all_conversations', 'can_view_assigned_conversations'])) {
		items.push({ key: 'inbox', label: 'Inbox', href: '/inbox', icon: Inbox });
	}

	if (can(member, 'can_view_all_contacts')) {
		items.push({ key: 'contacts', label: 'Contacts', href: '/contacts', icon: Users });
	}

	if (can(member, 'can_view_full_pipeline')) {
		items.push({ key: 'pipeline', label: 'Pipeline', href: '/pipeline', icon: GitBranch });
	}

	if (canAny(member, ['can_view_full_pipeline', 'can_view_assigned_jobs'])) {
		items.push({ key: 'jobs', label: 'Jobs', href: '/jobs', icon: Briefcase });
	}

	if (can(member, 'can_view_all_quotes')) {
		items.push({ key: 'quotes', label: 'Quotes', href: '/quotes', icon: FileText });
	}

	if (can(member, 'can_view_all_invoices')) {
		items.push({ key: 'invoices', label: 'Invoices', href: '/invoices', icon: Receipt });
	}

	if (canAny(member, ['can_view_all_appointments', 'can_view_assigned_appointments'])) {
		items.push({ key: 'appointments', label: 'Appointments', href: '/appointments', icon: Calendar });
	}

	if (can(member, 'can_view_reviews')) {
		items.push({ key: 'reputation', label: 'Reputation', href: '/reputation', icon: Star });
	}

	if (can(member, 'can_view_growth_feed')) {
		items.push({ key: 'growth', label: 'Growth', href: '/growth', icon: TrendingUp });
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
	icon: Settings
};

export const MORE_ITEM: NavItem = {
	key: 'more',
	label: 'More',
	href: '#more',
	icon: MoreHorizontal
};
