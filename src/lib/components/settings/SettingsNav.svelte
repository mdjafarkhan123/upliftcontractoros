<script lang="ts">
	import {
		Building2,
		Bot,
		CreditCard,
		UserCircle,
		CalendarClock,
		ChevronRight,
		Lock
	} from '@lucide/svelte';
	import type { Component } from 'svelte';

	let {
		role,
		featureAutomation,
		featureStripe,
		featureOnlineBooking
	}: {
		role: 'admin' | 'manager' | 'member';
		featureAutomation: boolean;
		featureStripe: boolean;
		featureOnlineBooking: boolean;
	} = $props();

	type Item = {
		href: string;
		label: string;
		description: string;
		icon: Component;
		adminOnly: boolean;
		locked: boolean;
		lockedReason?: string;
	};

	let items: Item[] = $derived([
		{
			href: '/settings/org',
			label: 'Business',
			description: 'Business name, address, branding',
			icon: Building2,
			adminOnly: true,
			locked: role !== 'admin',
			lockedReason: role !== 'admin' ? 'Admin only' : undefined
		},
		{
			href: '/settings/automation',
			label: 'Automation',
			description: 'Auto-replies, follow-ups, reminders',
			icon: Bot,
			adminOnly: true,
			locked: role !== 'admin' || !featureAutomation,
			lockedReason:
				role !== 'admin'
					? 'Admin only'
					: !featureAutomation
						? 'Not enabled for your plan'
						: undefined
		},
		{
			href: '/settings/stripe',
			label: 'Stripe',
			description: 'Connect Stripe to accept invoice payments',
			icon: CreditCard,
			adminOnly: true,
			locked: role !== 'admin' || !featureStripe,
			lockedReason:
				role !== 'admin' ? 'Admin only' : !featureStripe ? 'Not enabled for your plan' : undefined
		},
		{
			href: '/settings/booking',
			label: 'Booking Availability',
			description: 'Customer self-booking links and weekly hours',
			icon: CalendarClock,
			adminOnly: true,
			locked: role !== 'admin' || !featureOnlineBooking,
			lockedReason:
				role !== 'admin'
					? 'Admin only'
					: !featureOnlineBooking
						? 'Not enabled for your plan'
						: undefined
		},
		{
			href: '/settings/account',
			label: 'Account',
			description: 'Your name, email, password',
			icon: UserCircle,
			adminOnly: false,
			locked: false
		}
	]);
</script>

<nav class="flex flex-col gap-2">
	{#each items as item (item.href)}
		{#if item.locked}
			<div
				class="flex items-center gap-3 rounded-lg border border-dashed border-border/60 bg-muted/30 p-4 opacity-80"
				aria-disabled="true"
			>
				<div
					class="flex h-10 w-10 items-center justify-center rounded-lg bg-muted text-muted-foreground"
				>
					<item.icon class="h-5 w-5" />
				</div>
				<div class="flex-1 min-w-0">
					<div class="flex items-center gap-2">
						<h3 class="text-sm font-semibold text-foreground">{item.label}</h3>
						<Lock class="h-3 w-3 text-muted-foreground" />
					</div>
					<p class="truncate text-xs text-muted-foreground">{item.lockedReason}</p>
				</div>
			</div>
		{:else}
			<a
				href={item.href}
				class="group flex min-h-[64px] items-center gap-3 rounded-lg border border-border/60 bg-card p-4 shadow-card transition-all duration-150 ease-out hover:border-border hover:bg-muted/40 hover:shadow-dropdown focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			>
				<div
					class="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary"
				>
					<item.icon class="h-5 w-5" />
				</div>
				<div class="flex-1 min-w-0">
					<h3 class="text-sm font-semibold text-foreground">{item.label}</h3>
					<p class="truncate text-xs text-muted-foreground">{item.description}</p>
				</div>
				<ChevronRight
					class="h-4 w-4 text-muted-foreground/60 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-muted-foreground"
				/>
			</a>
		{/if}
	{/each}
</nav>
