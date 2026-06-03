<script lang="ts">
	import { formatCurrency } from '$lib/utils/format';
	import * as Avatar from '$lib/components/ui/avatar';
	import { Clock } from '@lucide/svelte';

	type Props = {
		title: string;
		contact_name: string;
		value: string | null;
		assignee_name: string | null;
		stage_entered_at: string;
		stale_after_days: number | null;
	};

	let { title, contact_name, value, assignee_name, stage_entered_at, stale_after_days }: Props =
		$props();

	const initials = $derived(
		(assignee_name ?? '')
			.split(/\s+/)
			.filter(Boolean)
			.slice(0, 2)
			.map((s) => s[0]!.toUpperCase())
			.join('')
	);

	const daysInStage = $derived(
		Math.max(0, Math.floor((Date.now() - new Date(stage_entered_at).getTime()) / 86_400_000))
	);

	const showChip = $derived(stale_after_days !== null);
	const isStale = $derived(stale_after_days !== null && daysInStage >= stale_after_days);
	const isVeryStale = $derived(stale_after_days !== null && daysInStage >= stale_after_days * 2);

	const chipClass = $derived(
		isVeryStale
			? 'bg-rose-500/10 text-rose-700 ring-1 ring-rose-500/30 dark:text-rose-300 dark:ring-rose-500/40'
			: isStale
				? 'bg-amber-500/10 text-amber-700 ring-1 ring-amber-500/30 dark:text-amber-300 dark:ring-amber-500/40'
				: 'bg-muted/60 text-muted-foreground ring-1 ring-border/60'
	);

	const chipLabel = $derived(daysInStage === 0 ? 'Today' : `${daysInStage}d`);
</script>

<div
	class="touch-none select-none rounded-lg border border-border/60 bg-card p-3 shadow-card transition-[box-shadow,border-color,background-color] duration-150 ease-out will-change-transform hover:border-border hover:bg-muted/40 hover:shadow-dropdown active:cursor-grabbing"
>
	<div class="mb-0.5 flex items-start justify-between gap-2">
		<div class="truncate text-sm font-semibold text-foreground">
			{contact_name}
		</div>
		{#if showChip}
			<span
				class={`inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${chipClass}`}
				title={`In stage for ${daysInStage} day${daysInStage === 1 ? '' : 's'}`}
			>
				<Clock class="h-3 w-3" aria-hidden="true" />
				{chipLabel}
			</span>
		{/if}
	</div>
	<div class="mb-3 line-clamp-2 text-xs text-muted-foreground">{title}</div>
	<div class="flex items-center justify-between">
		<span class="text-sm font-semibold tabular-nums text-foreground">
			{value ? formatCurrency(value) : '—'}
		</span>
		{#if assignee_name}
			<Avatar.Root class="h-7 w-7">
				<Avatar.Fallback class="bg-primary/10 text-[10px] font-semibold text-primary">
					{initials}
				</Avatar.Fallback>
			</Avatar.Root>
		{/if}
	</div>
</div>
