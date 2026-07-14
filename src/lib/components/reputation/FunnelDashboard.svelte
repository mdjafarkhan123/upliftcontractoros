<script lang="ts">
	import type { FunnelPeriod, FunnelSummary } from '$lib/types/reputation';
	import SkeletonLoader from '$lib/components/shared/SkeletonLoader.svelte';
	import { reputationFunnelStore } from '$lib/stores/reputation.svelte';

	let period = $state<FunnelPeriod>('30d');

	$effect(() => {
		void reputationFunnelStore.load(period);
	});

	const data = $derived<FunnelSummary | null>(reputationFunnelStore.get(period));
	const status = $derived(reputationFunnelStore.getStatus(period));

	function pct(num: number, den: number): number {
		if (den <= 0) return 0;
		return Math.round((num / den) * 100);
	}

	const steps = $derived(
		data
			? [
					{
						key: 'sent',
						label: 'Sent',
						value: data.sent,
						of: data.sent,
						icon: 'ri-send-plane-line'
					},
					{
						key: 'opened',
						label: 'Opened',
						value: data.opened,
						of: data.sent,
						icon: 'ri-cursor-line'
					},
					{
						key: 'rated',
						label: 'Rated',
						value: data.rated,
						of: data.opened,
						icon: 'ri-star-line'
					},
					{
						key: 'converted',
						label: 'Converted',
						value: data.converted,
						of: data.rated,
						icon: 'ri-checkbox-circle-line'
					}
				]
			: []
	);

	const totalRatings = $derived(
		data
			? data.star_distribution['1'] +
					data.star_distribution['2'] +
					data.star_distribution['3'] +
					data.star_distribution['4'] +
					data.star_distribution['5']
			: 0
	);

	const periods: { value: FunnelPeriod; label: string }[] = [
		{ value: '7d', label: '7 days' },
		{ value: '30d', label: '30 days' },
		{ value: '90d', label: '90 days' }
	];
</script>

<section class="rep-funnel">
	<header class="rep-funnel__head">
		<div>
			<h2 class="rep-funnel__title">Review funnel</h2>
			<p class="rep-funnel__sub">Where requests convert — and where they leak.</p>
		</div>
		<div class="rep-funnel__periods" role="tablist" aria-label="Funnel period">
			{#each periods as p (p.value)}
				<button
					role="tab"
					aria-selected={period === p.value}
					type="button"
					onclick={() => (period = p.value)}
					class="rep-funnel__period"
					class:rep-funnel__period--active={period === p.value}
				>
					{p.label}
				</button>
			{/each}
		</div>
	</header>

	{#if !data && status === 'loading'}
		<div style="margin-top: 1rem">
			<SkeletonLoader lines={2} height="64px" label="Loading funnel" />
		</div>
	{:else if data && data.sent === 0}
		<p class="rep-funnel__empty">
			Once you start sending review requests, your funnel will appear here.
		</p>
	{:else if data}
		<!-- Step tiles: count + conversion from previous step -->
		<div class="rep-funnel__steps">
			{#each steps as s, i (s.key)}
				{@const conv = i === 0 ? null : pct(s.value, s.of)}
				<div class="rep-step">
					<div class="rep-step__head">
						<i class={s.icon} aria-hidden="true"></i>
						<span class="rep-step__label">{s.label}</span>
					</div>
					<p class="rep-step__value">{s.value}</p>
					{#if conv !== null}
						<p class="rep-step__conv">{conv}% of {s.of}</p>
					{:else}
						<p class="rep-step__conv">total</p>
					{/if}
				</div>
			{/each}
		</div>

		<!-- Horizontal funnel bars (each bar widthed against `sent`) -->
		<div class="rep-funnel__bars">
			{#each steps as s (s.key)}
				{@const w = data.sent > 0 ? Math.max(2, Math.round((s.value / data.sent) * 100)) : 0}
				<div class="rep-bar">
					<span class="rep-bar__label">{s.label}</span>
					<div class="rep-bar__track">
						<div class="rep-bar__fill" style="width: {w}%"></div>
					</div>
					<span class="rep-bar__val">{s.value}</span>
				</div>
			{/each}
		</div>

		<!-- Star distribution -->
		{#if totalRatings > 0}
			<div class="rep-funnel__stars">
				<div class="rep-funnel__stars-head">
					<h3 class="rep-funnel__stars-title">Star distribution</h3>
					<span class="rep-funnel__stars-count">{totalRatings} rated</span>
				</div>
				<div class="rep-funnel__star-rows">
					{#each [5, 4, 3, 2, 1] as star (star)}
						{@const count = data.star_distribution[String(star) as '1' | '2' | '3' | '4' | '5']}
						{@const pctOfRated = totalRatings > 0 ? Math.round((count / totalRatings) * 100) : 0}
						{@const positive = star >= 4}
						<div class="rep-bar">
							<span class="rep-bar__label-star">
								{star}
								<i class="ri-star-fill" aria-hidden="true"></i>
							</span>
							<div class="rep-bar__track">
								<div
									class="rep-bar__fill"
									class:rep-bar__fill--positive={positive}
									class:rep-bar__fill--negative={!positive}
									style="width: {Math.max(count > 0 ? 2 : 0, pctOfRated)}%"
								></div>
							</div>
							<span class="rep-bar__val-wide">{count} · {pctOfRated}%</span>
						</div>
					{/each}
				</div>
			</div>
		{/if}
	{/if}
</section>
