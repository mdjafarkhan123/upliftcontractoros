<script lang="ts">
	import type { JobsStats } from '$lib/types/jobs';

	export type JobStatsKey = 'today' | 'late' | 'awaiting_review' | 'unscheduled';

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
		icon: string;
		tint: string;
	};

	const cards: Card[] = [
		{ scope: 'today', label: 'Today', icon: 'ri-calendar-schedule-line', tint: 'today' },
		{ scope: 'late', label: 'Late', icon: 'ri-alarm-warning-line', tint: 'late' },
		{
			scope: 'awaiting_review',
			label: 'Awaiting review',
			icon: 'ri-star-line',
			tint: 'awaiting-review'
		},
		{
			scope: 'unscheduled',
			label: 'Unscheduled',
			icon: 'ri-calendar-close-line',
			tint: 'unscheduled'
		}
	];

	function valueFor(key: JobStatsKey): number | null {
		if (!stats) return null;
		return stats[key];
	}
</script>

<div class="job-stats">
	{#each cards as card (card.scope)}
		{@const active = activeKey === card.scope}
		{@const v = valueFor(card.scope)}
		<button
			type="button"
			onclick={() => onSelect(card.scope)}
			aria-pressed={active}
			class="job-stats__card"
			class:job-stats__card--active={active}
		>
			<div class="job-stats__top">
				<span class="job-stats__label">{card.label}</span>
				<span class="job-stats__icon job-stats__icon--{card.tint}">
					<i class={card.icon} aria-hidden="true"></i>
				</span>
			</div>
			{#if loading && v === null}
				<span class="job-stats__skeleton"></span>
			{:else}
				<span class="job-stats__value">{v ?? 0}</span>
			{/if}
		</button>
	{/each}
</div>
