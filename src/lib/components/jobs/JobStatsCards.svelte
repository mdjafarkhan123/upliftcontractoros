<script lang="ts">
	import { CalendarClock, Hammer, Star, CalendarOff, type Icon as IconType } from '@lucide/svelte';
	import { cn } from '$lib/utils/cn';
	import type { JobsStats } from '$lib/types/jobs';

	export type JobStatsKey = 'today' | 'in_progress' | 'awaiting_review' | 'unscheduled';

	let {
		stats,
		loading = false,
		activeKey = null,
		onSelect
	}: {
		stats: JobsStats | null;
		loading?: boolean;
		activeKey?: JobStatsKey | null;
		onSelect: (key: JobStatsKey) => void;
	} = $props();

	type Card = {
		scope: JobStatsKey;
		label: string;
		icon: typeof IconType;
		valueClass: string;
		ringClass: string;
		iconClass: string;
	};

	const cards: Card[] = [
		{
			scope: 'today',
			label: 'Today',
			icon: CalendarClock,
			valueClass: 'text-foreground',
			ringClass: 'bg-primary/10 text-primary ring-primary/20',
			iconClass: ''
		},
		{
			scope: 'in_progress',
			label: 'In progress',
			icon: Hammer,
			valueClass: 'text-foreground',
			ringClass:
				'bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-500/10 dark:text-sky-400 dark:ring-sky-500/20',
			iconClass: ''
		},
		{
			scope: 'awaiting_review',
			label: 'Awaiting review',
			icon: Star,
			valueClass: 'text-foreground',
			ringClass:
				'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:ring-amber-500/20',
			iconClass: ''
		},
		{
			scope: 'unscheduled',
			label: 'Unscheduled',
			icon: CalendarOff,
			valueClass: 'text-foreground',
			ringClass:
				'bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:ring-rose-500/20',
			iconClass: ''
		}
	];

	function valueFor(key: JobStatsKey): number | null {
		if (!stats) return null;
		return stats[key];
	}
</script>

<div class="grid grid-cols-2 gap-2.5 sm:grid-cols-4 sm:gap-3">
	{#each cards as card (card.scope)}
		{@const active = activeKey === card.scope}
		{@const v = valueFor(card.scope)}
		<button
			type="button"
			onclick={() => onSelect(card.scope)}
			aria-pressed={active}
			class={cn(
				'group flex min-h-[88px] flex-col justify-between rounded-2xl border bg-card p-3 text-left shadow-card transition-all duration-150 ease-out',
				'hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-dropdown',
				'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
				active
					? 'border-primary/40 ring-1 ring-primary/30 dark:border-primary/30'
					: 'border-border/70 dark:border-white/10'
			)}
		>
			<div class="flex items-center justify-between gap-2">
				<span class="truncate text-xs font-medium text-muted-foreground">{card.label}</span>
				<span
					class={cn(
						'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full ring-1 ring-inset',
						card.ringClass
					)}
				>
					<card.icon class="h-3.5 w-3.5" />
				</span>
			</div>
			<div class="mt-2">
				{#if loading && v === null}
					<span class="inline-block h-7 w-10 animate-pulse rounded-md bg-muted"></span>
				{:else}
					<span
						class={cn(
							'text-2xl font-semibold leading-none tracking-tight sm:text-3xl',
							card.valueClass
						)}
					>
						{v ?? 0}
					</span>
				{/if}
			</div>
		</button>
	{/each}
</div>
