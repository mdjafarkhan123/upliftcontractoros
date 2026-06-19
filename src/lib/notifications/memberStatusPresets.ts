import type { Component } from 'svelte';
import { Building2, Hammer, Headphones, Coffee } from '@lucide/svelte';
import type { MemberNotificationStatus } from './memberStatus';

// Visual presets for "My Status" — icons + colors for the header, status menu,
// and settings page. UI-ONLY: this file imports Svelte/lucide and must never be
// imported by server code (the delivery worker runs in plain Node and cannot
// parse `.svelte` files). Pure logic/types live in `memberStatus.ts`.
export type MemberStatusPreset = {
	value: MemberNotificationStatus;
	label: string;
	description: string;
	icon: Component;
	dotClass: string; // status dot background
	textClass: string; // icon tint
};

export const MEMBER_STATUS_PRESETS: MemberStatusPreset[] = [
	{
		value: 'in_office',
		label: 'In office',
		description: 'Everything reaches you.',
		icon: Building2,
		dotClass: 'bg-emerald-500',
		textClass: 'text-emerald-500'
	},
	{
		value: 'on_job',
		label: 'On a job',
		description: 'Urgent alerts can text you.',
		icon: Hammer,
		dotClass: 'bg-blue-500',
		textClass: 'text-blue-500'
	},
	{
		value: 'deep_work',
		label: 'Deep work',
		description: 'Only the most urgent break through.',
		icon: Headphones,
		dotClass: 'bg-violet-500',
		textClass: 'text-violet-500'
	},
	{
		value: 'off_duty',
		label: 'Off duty',
		description: 'Quiet — emergencies only.',
		icon: Coffee,
		dotClass: 'bg-slate-400',
		textClass: 'text-slate-400'
	}
];

export const MEMBER_STATUS_MAP: Record<MemberNotificationStatus, MemberStatusPreset> =
	Object.fromEntries(MEMBER_STATUS_PRESETS.map((p) => [p.value, p])) as Record<
		MemberNotificationStatus,
		MemberStatusPreset
	>;
