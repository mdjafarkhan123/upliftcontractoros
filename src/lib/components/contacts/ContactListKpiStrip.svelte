<script lang="ts">
	import { cn } from '$lib/utils/cn';
	import { Users, UserPlus, UserCheck, CalendarClock } from '@lucide/svelte';

	let {
		total,
		leads,
		customers,
		needsFollowUp,
		activeFollowUp = false,
		loading = false,
		onSelectStatus,
		onToggleFollowUp
	}: {
		total: number;
		leads: number;
		customers: number;
		needsFollowUp: number;
		activeFollowUp?: boolean;
		loading?: boolean;
		onSelectStatus?: (status: 'leads' | 'customers') => void;
		onToggleFollowUp?: () => void;
	} = $props();

	type Tile = {
		label: string;
		value: number;
		icon: typeof Users;
		iconClass: string;
		valueClass: string;
		action: 'leads' | 'customers' | 'followUp' | null;
		active: boolean;
	};

	const tiles = $derived<Tile[]>([
		{
			label: 'Total',
			value: total,
			icon: Users,
			iconClass: 'bg-muted text-muted-foreground',
			valueClass: 'text-foreground',
			action: null,
			active: false
		},
		{
			label: 'Leads',
			value: leads,
			icon: UserPlus,
			iconClass: 'bg-primary/10 text-primary',
			valueClass: 'text-foreground',
			action: 'leads',
			active: false
		},
		{
			label: 'Customers',
			value: customers,
			icon: UserCheck,
			iconClass: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400',
			valueClass: 'text-foreground',
			action: 'customers',
			active: false
		},
		{
			label: 'Needs follow-up',
			value: needsFollowUp,
			icon: CalendarClock,
			iconClass:
				needsFollowUp > 0
					? 'bg-orange-50 text-orange-600 dark:bg-orange-500/10 dark:text-orange-400'
					: 'bg-muted text-muted-foreground',
			valueClass:
				needsFollowUp > 0 ? 'text-orange-700 dark:text-orange-400' : 'text-muted-foreground',
			action: 'followUp',
			active: activeFollowUp
		}
	]);

	function runAction(tile: Tile) {
		if (tile.action === 'followUp') onToggleFollowUp?.();
		else if (tile.action === 'leads' || tile.action === 'customers') onSelectStatus?.(tile.action);
	}

	function isClickable(tile: Tile): boolean {
		if (tile.action === 'followUp') return !!onToggleFollowUp;
		if (tile.action === 'leads' || tile.action === 'customers') return !!onSelectStatus;
		return false;
	}
</script>

{#snippet tileInner(tile: (typeof tiles)[number])}
	<div class="flex items-center justify-between gap-2">
		<p class="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
			{tile.label}
		</p>
		<div
			class={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-lg', tile.iconClass)}
		>
			<tile.icon class="h-3.5 w-3.5" />
		</div>
	</div>
	{#if loading}
		<div class="mt-0.5 h-6 w-10 animate-pulse rounded bg-muted"></div>
	{:else}
		<p class={cn('text-lg font-bold tracking-tight', tile.valueClass)}>{tile.value}</p>
	{/if}
{/snippet}

<!-- Mobile: horizontal scroll strip; Desktop: 4-col grid -->
<div
	class="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-1 [scrollbar-width:none] md:grid md:grid-cols-4 md:overflow-visible md:pb-0 [&::-webkit-scrollbar]:hidden"
	aria-label="Contact stats"
>
	{#each tiles as tile (tile.label)}
		{#if isClickable(tile)}
			<button
				type="button"
				aria-pressed={tile.action === 'followUp' ? tile.active : undefined}
				onclick={() => runAction(tile)}
				class={cn(
					'group flex min-w-[130px] shrink-0 snap-start flex-col gap-2 rounded-xl border bg-card p-3.5 text-left shadow-card transition-all duration-150 hover:shadow-dropdown focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:min-w-0',
					tile.active
						? 'border-orange-300 ring-1 ring-orange-300 dark:border-orange-500/40 dark:ring-orange-500/40'
						: 'border-border/60 hover:border-primary/30'
				)}
			>
				{@render tileInner(tile)}
			</button>
		{:else}
			<div
				class="flex min-w-[130px] shrink-0 snap-start flex-col gap-2 rounded-xl border border-border/60 bg-card p-3.5 shadow-card md:min-w-0"
			>
				{@render tileInner(tile)}
			</div>
		{/if}
	{/each}
</div>
