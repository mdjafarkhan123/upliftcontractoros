<script lang="ts">
	import { getMemberContext } from '$lib/context/member';
	import { FilePlus2, UserPlus, CalendarPlus } from '@lucide/svelte';
	import type { Component } from 'svelte';

	const member = getMemberContext();

	type Action = { label: string; href: string; icon: Component; show: boolean };

	const actions = $derived<Action[]>(
		[
			{
				label: 'New quote',
				href: '/quotes/new',
				icon: FilePlus2,
				show: member().can_create_quotes
			},
			{
				label: 'Add lead',
				href: '/contacts/new',
				icon: UserPlus,
				show: member().can_create_contacts
			},
			{
				label: 'Schedule job',
				href: '/jobs?new=1',
				icon: CalendarPlus,
				show: member().can_view_full_pipeline
			}
		].filter((a) => a.show)
	);
</script>

{#if actions.length > 0}
	<div class="grid w-full grid-cols-3 gap-2 sm:flex sm:w-auto">
		{#each actions as action (action.href)}
			<a
				href={action.href}
				title={action.label}
				class="group inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg border border-primary/40 bg-card px-2.5 text-xs font-medium text-foreground shadow-card transition-all duration-150 ease-out hover:-translate-y-0.5 hover:border-primary/70 hover:bg-card-raised hover:shadow-dropdown focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:px-3.5 sm:text-sm dark:border-[hsl(var(--brand-light)/0.4)] dark:hover:border-[hsl(var(--brand-light)/0.7)]"
			>
				<action.icon class="h-4 w-4 shrink-0 text-primary" />
				<span class="truncate">{action.label}</span>
			</a>
		{/each}
	</div>
{/if}
