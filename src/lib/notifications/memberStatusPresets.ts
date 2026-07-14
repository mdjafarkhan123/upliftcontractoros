import type { MemberNotificationStatus } from './memberStatus';

// Visual presets for "My Status" — icons + colors for the header, status menu,
// and settings page. UI-ONLY: this file must never be imported by server code
// (the delivery worker runs in plain Node). Pure logic/types live in `memberStatus.ts`.
export type MemberStatusPreset = {
	value: MemberNotificationStatus;
	label: string;
	description: string;
	iconClass: string; // Remix Icon class, e.g. "ri-building-2-line"
	dotClass: string;  // Tailwind bg-* — kept for MyStatusMenu until full BEM migration
	textClass: string; // Tailwind text-* — kept for MyStatusMenu until full BEM migration
	dotColor: string;  // hex — use this for BEM components (status dot, avatar badge)
	textColor: string; // hex — use this for BEM components (icon tint)
};

export const MEMBER_STATUS_PRESETS: MemberStatusPreset[] = [
	{
		value: 'in_office',
		label: 'In office',
		description: 'Everything reaches you.',
		iconClass: 'ri-building-2-line',
		dotClass: 'bg-emerald-500',
		textClass: 'text-emerald-500',
		dotColor: '#10b981',
		textColor: '#10b981'
	},
	{
		value: 'on_job',
		label: 'On a job',
		description: 'Urgent alerts can text you.',
		iconClass: 'ri-hammer-line',
		dotClass: 'bg-blue-500',
		textClass: 'text-blue-500',
		dotColor: '#3b82f6',
		textColor: '#3b82f6'
	},
	{
		value: 'deep_work',
		label: 'Deep work',
		description: 'Only the most urgent break through.',
		iconClass: 'ri-headphone-line',
		dotClass: 'bg-violet-500',
		textClass: 'text-violet-500',
		dotColor: '#8b5cf6',
		textColor: '#8b5cf6'
	},
	{
		value: 'off_duty',
		label: 'Off duty',
		description: 'Quiet — emergencies only.',
		iconClass: 'ri-cup-line',
		dotClass: 'bg-slate-400',
		textClass: 'text-slate-400',
		dotColor: '#94a3b8',
		textColor: '#94a3b8'
	}
];

export const MEMBER_STATUS_MAP: Record<MemberNotificationStatus, MemberStatusPreset> =
	Object.fromEntries(MEMBER_STATUS_PRESETS.map((p) => [p.value, p])) as Record<
		MemberNotificationStatus,
		MemberStatusPreset
	>;
