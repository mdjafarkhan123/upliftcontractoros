<script lang="ts">
	import { page } from '$app/state';
	import {
		Building2,
		Bot,
		Blocks,
		UserCircle,
		CalendarClock,
		Users,
		Bell,
		Zap,
		MessageSquare,
		Mail,
		Columns3,
		BookOpen,
		Lock
	} from '@lucide/svelte';
	import type { Component } from 'svelte';
	import { cn } from '$lib/utils/cn';

	let {
		role,
		featureAutomation,
		featureOnlineBooking,
		canManagePipeline,
		canViewCatalog
	}: {
		role: 'admin' | 'manager' | 'member';
		featureAutomation: boolean;
		featureOnlineBooking: boolean;
		canManagePipeline: boolean;
		canViewCatalog: boolean;
	} = $props();

	function isActive(href: string): boolean {
		const path = page.url.pathname;
		return path === href || path.startsWith(href + '/');
	}

	type Item = {
		href: string;
		label: string;
		description: string;
		icon: Component;
		locked: boolean;
		lockedReason?: string;
		iconBg: string;
		iconColor: string;
	};

	let orgItems: Item[] = $derived([
		{
			href: '/settings/org',
			label: 'Business',
			description: 'Name, address, brand colors, logo',
			icon: Building2,
			locked: role !== 'admin',
			lockedReason: role !== 'admin' ? 'Admin only' : undefined,
			iconBg: 'bg-emerald-50 dark:bg-emerald-500/10',
			iconColor: 'text-emerald-600 dark:text-emerald-400'
		},
		{
			href: '/settings/automation',
			label: 'Automation',
			description: 'Auto-replies, follow-ups, reminders',
			icon: Bot,
			locked: role !== 'admin' || !featureAutomation,
			lockedReason:
				role !== 'admin' ? 'Admin only' : !featureAutomation ? 'Not on your plan' : undefined,
			iconBg: 'bg-violet-50 dark:bg-violet-500/10',
			iconColor: 'text-violet-600 dark:text-violet-400'
		},
		{
			href: '/settings/email',
			label: 'Email',
			description: 'Your branded sending address',
			icon: Mail,
			locked: role !== 'admin',
			lockedReason: role !== 'admin' ? 'Admin only' : undefined,
			iconBg: 'bg-rose-50 dark:bg-rose-500/10',
			iconColor: 'text-rose-600 dark:text-rose-400'
		},
		{
			href: '/settings/integrations',
			label: 'Integrations',
			description: 'Messenger, payments, and more',
			icon: Blocks,
			locked: role !== 'admin',
			lockedReason: role !== 'admin' ? 'Admin only' : undefined,
			iconBg: 'bg-blue-50 dark:bg-blue-500/10',
			iconColor: 'text-blue-600 dark:text-blue-400'
		},
		{
			href: '/settings/booking',
			label: 'Booking',
			description: 'Self-booking links and availability',
			icon: CalendarClock,
			locked: role !== 'admin' || !featureOnlineBooking,
			lockedReason:
				role !== 'admin' ? 'Admin only' : !featureOnlineBooking ? 'Not on your plan' : undefined,
			iconBg: 'bg-amber-50 dark:bg-amber-500/10',
			iconColor: 'text-amber-600 dark:text-amber-400'
		},
		{
			href: '/settings/team',
			label: 'Team',
			description: 'Members, roles, and permissions',
			icon: Users,
			locked: role !== 'admin',
			lockedReason: role !== 'admin' ? 'Admin only' : undefined,
			iconBg: 'bg-primary/10',
			iconColor: 'text-primary'
		},
		{
			href: '/settings/sms-credit',
			label: 'SMS Credits',
			description: 'Text balance, usage, and activity',
			icon: MessageSquare,
			locked: role !== 'admin',
			lockedReason: role !== 'admin' ? 'Admin only' : undefined,
			iconBg: 'bg-sky-50 dark:bg-sky-500/10',
			iconColor: 'text-sky-600 dark:text-sky-400'
		},
		{
			href: '/settings/stages',
			label: 'Pipeline Stages',
			description: 'Customize your pipeline columns',
			icon: Columns3,
			locked: !canManagePipeline,
			lockedReason: !canManagePipeline ? 'No access' : undefined,
			iconBg: 'bg-indigo-50 dark:bg-indigo-500/10',
			iconColor: 'text-indigo-600 dark:text-indigo-400'
		},
		{
			href: '/settings/quick-replies',
			label: 'Quick Replies',
			description: 'Saved message templates for your inbox',
			icon: Zap,
			locked: false,
			iconBg: 'bg-yellow-50 dark:bg-yellow-500/10',
			iconColor: 'text-yellow-600 dark:text-yellow-400'
		},
		{
			href: '/settings/catalog',
			label: 'Price Book',
			description: 'Reusable products, services, and pricing',
			icon: BookOpen,
			locked: !canViewCatalog,
			lockedReason: !canViewCatalog ? 'No access' : undefined,
			iconBg: 'bg-teal-50 dark:bg-teal-500/10',
			iconColor: 'text-teal-600 dark:text-teal-400'
		}
	]);

	let personalItems: Item[] = $derived([
		{
			href: '/settings/account',
			label: 'Account',
			description: 'Your name, email, and password',
			icon: UserCircle,
			locked: false,
			iconBg: 'bg-slate-100 dark:bg-slate-500/10',
			iconColor: 'text-slate-600 dark:text-slate-400'
		},
		{
			href: '/settings/notifications',
			label: 'Notifications',
			description: 'Choose what buzzes your phone',
			icon: Bell,
			locked: false,
			iconBg: 'bg-amber-50 dark:bg-amber-500/10',
			iconColor: 'text-amber-600 dark:text-amber-400'
		}
	]);
</script>

<div class="flex flex-col gap-7">
	<!-- Organization section -->
	<div class="flex flex-col gap-3">
		<p class="px-1 text-xs font-semibold uppercase tracking-widest text-muted-foreground/70">
			Organization
		</p>
		<div class="grid grid-cols-2 gap-3 md:grid-cols-3">
			{#each orgItems as item (item.href)}
				{@render navItem(item)}
			{/each}
		</div>
	</div>

	<!-- Personal section -->
	<div class="flex flex-col gap-3">
		<p class="px-1 text-xs font-semibold uppercase tracking-widest text-muted-foreground/70">
			Personal
		</p>
		<div class="grid grid-cols-2 gap-3 md:grid-cols-3">
			{#each personalItems as item (item.href)}
				{@render navItem(item)}
			{/each}
		</div>
	</div>
</div>

{#snippet navItem(item: Item)}
	{@const active = isActive(item.href)}
	{#if item.locked}
		<div
			class="group relative flex flex-col items-center gap-3 rounded-xl border border-border/40 bg-muted/30 px-3 py-5 opacity-60"
			aria-disabled="true"
		>
			<div
				class="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground"
			>
				<item.icon class="h-6 w-6" />
			</div>
			<div class="flex flex-col items-center gap-1 min-w-0">
				<p class="text-sm font-medium text-foreground text-center">{item.label}</p>
				<span
					class="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
				>
					<Lock class="h-2.5 w-2.5" />
					{item.lockedReason}
				</span>
			</div>
		</div>
	{:else}
		<a
			href={item.href}
			class={cn(
				'group relative flex flex-col items-center gap-3 rounded-xl border px-3 py-5 shadow-card transition-all duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
				active
					? 'border-primary/40 bg-primary/5 ring-1 ring-primary/20'
					: 'border-border/60 bg-card hover:border-border hover:bg-muted/30 hover:shadow-dropdown'
			)}
		>
			<div
				class={cn(
					'flex h-12 w-12 shrink-0 items-center justify-center rounded-xl transition-transform duration-150 group-hover:scale-105',
					item.iconBg,
					item.iconColor
				)}
			>
				<item.icon class="h-6 w-6" />
			</div>
			<div class="flex flex-col items-center min-w-0">
				<p class="text-sm font-medium text-foreground text-center">{item.label}</p>
				<p class="mt-0.5 text-xs text-muted-foreground text-center leading-tight">
					{item.description}
				</p>
			</div>
		</a>
	{/if}
{/snippet}
