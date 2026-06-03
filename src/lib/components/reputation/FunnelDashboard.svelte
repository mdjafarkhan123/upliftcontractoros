<script lang="ts">
	import { Send, MousePointerClick, Star, CheckCircle2 } from '@lucide/svelte';
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
					{ key: 'sent', label: 'Sent', value: data.sent, of: data.sent, icon: Send },
					{
						key: 'opened',
						label: 'Opened',
						value: data.opened,
						of: data.sent,
						icon: MousePointerClick
					},
					{ key: 'rated', label: 'Rated', value: data.rated, of: data.opened, icon: Star },
					{
						key: 'converted',
						label: 'Converted',
						value: data.converted,
						of: data.rated,
						icon: CheckCircle2
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

<section class="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
	<header class="flex items-center justify-between gap-3">
		<div>
			<h2 class="text-sm font-semibold text-foreground">Review funnel</h2>
			<p class="text-xs text-muted-foreground">Where requests convert — and where they leak.</p>
		</div>
		<div
			role="tablist"
			aria-label="Funnel period"
			class="inline-flex rounded-lg border border-border bg-muted p-0.5"
		>
			{#each periods as p (p.value)}
				<button
					role="tab"
					aria-selected={period === p.value}
					type="button"
					onclick={() => (period = p.value)}
					class="rounded-md px-2.5 py-1 text-xs font-medium transition-colors {period === p.value
						? 'bg-card text-foreground shadow-sm'
						: 'text-muted-foreground hover:text-foreground'}"
				>
					{p.label}
				</button>
			{/each}
		</div>
	</header>

	{#if !data && status === 'loading'}
		<div class="mt-4"><SkeletonLoader lines={2} height="64px" label="Loading funnel" /></div>
	{:else if data && data.sent === 0}
		<p class="mt-4 text-sm text-muted-foreground">
			Once you start sending review requests, your funnel will appear here.
		</p>
	{:else if data}
		<!-- Step tiles: count + conversion from previous step -->
		<div class="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
			{#each steps as s, i (s.key)}
				{@const StepIcon = s.icon}
				{@const conv = i === 0 ? null : pct(s.value, s.of)}
				<div class="rounded-xl border border-border bg-background p-3">
					<div class="flex items-center gap-1.5 text-muted-foreground">
						<StepIcon class="h-3.5 w-3.5" />
						<span class="text-[11px] font-medium uppercase tracking-wide">{s.label}</span>
					</div>
					<p class="mt-1 text-2xl font-semibold text-foreground tabular-nums">{s.value}</p>
					{#if conv !== null}
						<p class="mt-0.5 text-[11px] text-muted-foreground tabular-nums">
							{conv}% of {s.of}
						</p>
					{:else}
						<p class="mt-0.5 text-[11px] text-muted-foreground">total</p>
					{/if}
				</div>
			{/each}
		</div>

		<!-- Horizontal funnel bars (each bar widthed against `sent`) -->
		<div class="mt-4 space-y-1.5">
			{#each steps as s (s.key)}
				{@const w = data.sent > 0 ? Math.max(2, Math.round((s.value / data.sent) * 100)) : 0}
				<div class="flex items-center gap-2">
					<span class="w-16 shrink-0 text-[11px] text-muted-foreground">{s.label}</span>
					<div class="relative h-2 flex-1 overflow-hidden rounded-full bg-muted">
						<div
							class="h-full rounded-full bg-primary/70 transition-[width] duration-500"
							style="width: {w}%"
						></div>
					</div>
					<span
						class="w-10 shrink-0 text-right text-[11px] font-medium tabular-nums text-foreground"
					>
						{s.value}
					</span>
				</div>
			{/each}
		</div>

		<!-- Star distribution -->
		{#if totalRatings > 0}
			<div class="mt-5 border-t border-border pt-4">
				<div class="flex items-center justify-between">
					<h3 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
						Star distribution
					</h3>
					<span class="text-[11px] text-muted-foreground tabular-nums">
						{totalRatings} rated
					</span>
				</div>
				<div class="mt-2 space-y-1.5">
					{#each [5, 4, 3, 2, 1] as star (star)}
						{@const count = data.star_distribution[String(star) as '1' | '2' | '3' | '4' | '5']}
						{@const pctOfRated = totalRatings > 0 ? Math.round((count / totalRatings) * 100) : 0}
						{@const positive = star >= 4}
						<div class="flex items-center gap-2">
							<span class="flex w-8 shrink-0 items-center gap-0.5 text-[11px] tabular-nums">
								{star}
								<Star class="h-3 w-3 fill-current text-amber-500" />
							</span>
							<div class="relative h-2 flex-1 overflow-hidden rounded-full bg-muted">
								<div
									class="h-full rounded-full transition-[width] duration-500 {positive
										? 'bg-emerald-500/80'
										: 'bg-rose-500/70'}"
									style="width: {Math.max(count > 0 ? 2 : 0, pctOfRated)}%"
								></div>
							</div>
							<span
								class="w-12 shrink-0 text-right text-[11px] font-medium tabular-nums text-foreground"
							>
								{count} · {pctOfRated}%
							</span>
						</div>
					{/each}
				</div>
			</div>
		{/if}
	{/if}
</section>
