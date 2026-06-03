<script lang="ts">
	import type { DashboardReputation } from '$lib/types/dashboard';
	import { Star, ShieldOff, TrendingUp, TrendingDown, Sparkles } from '@lucide/svelte';

	let { reputation }: { reputation: DashboardReputation | null } = $props();

	type State = 'unavailable' | 'feature_disabled' | 'no_reviews' | 'early' | 'healthy';

	const state: State = $derived.by(() => {
		if (!reputation) return 'unavailable';
		if (!reputation.funnel_enabled) return 'feature_disabled';
		if (reputation.total_reviews === 0) return 'no_reviews';
		if (reputation.total_reviews < 10) return 'early';
		return 'healthy';
	});

	const velocity = $derived.by(() => {
		if (!reputation) return null;
		const { reviews_this_month, reviews_last_month } = reputation;
		if (reviews_this_month === 0 || reviews_last_month === 0) return null;
		const delta = ((reviews_this_month - reviews_last_month) / reviews_last_month) * 100;
		return { pct: Math.round(delta), up: delta >= 0 };
	});
</script>

<section
	class="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-card dark:border-white/10"
>
	<header
		class="flex items-center justify-between border-b border-border/70 bg-card-raised/35 px-5 py-4"
	>
		<h2 class="text-base font-semibold tracking-tight text-foreground">Reputation snapshot</h2>
		<a
			href="/reputation"
			class="rounded-md text-xs font-medium text-muted-foreground transition-colors duration-150 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			>View all</a
		>
	</header>

	{#if state === 'unavailable'}
		<div class="flex flex-col items-center gap-2 bg-muted/20 px-6 py-8 text-center">
			<div class="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
				<Star class="h-5 w-5 text-muted-foreground" />
			</div>
			<p class="text-sm font-medium text-foreground">Reputation unavailable</p>
			<p class="text-xs text-muted-foreground">We couldn't load review stats. Try again soon.</p>
		</div>
	{:else if state === 'feature_disabled'}
		<div class="flex flex-col items-center gap-2 bg-muted/20 px-6 py-8 text-center">
			<div class="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
				<ShieldOff class="h-5 w-5 text-muted-foreground" />
			</div>
			<p class="text-sm font-medium text-foreground">Review automation inactive</p>
			<p class="text-xs text-muted-foreground">Turn on the review funnel in automation settings.</p>
		</div>
	{:else if state === 'no_reviews' && reputation}
		<div class="flex flex-col items-center gap-2 bg-emerald-500/5 px-6 py-8 text-center">
			<div
				class="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-500"
			>
				<Sparkles class="h-5 w-5" />
			</div>
			<p class="text-sm font-medium text-foreground">Review funnel active</p>
			<p class="text-xs text-muted-foreground">Waiting for your first review</p>
			{#if reputation.requests_this_month > 0}
				<p class="mt-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
					{reputation.requests_this_month} request{reputation.requests_this_month === 1 ? '' : 's'} sent
					this month
				</p>
			{/if}
		</div>
	{:else if reputation}
		<div class="px-5 py-5">
			<div class="flex items-baseline gap-2">
				<Star class="h-5 w-5 shrink-0 fill-amber-400 text-amber-400" aria-hidden="true" />
				<span class="text-3xl font-semibold tabular-nums tracking-tight text-foreground">
					{reputation.avg_rating?.toFixed(1) ?? '—'}
				</span>
				<span class="text-sm text-muted-foreground">
					/ 5 · {reputation.total_reviews} review{reputation.total_reviews === 1 ? '' : 's'}
				</span>
			</div>

			<div class="mt-4 flex items-center justify-between gap-3">
				<div class="flex flex-col">
					<span class="text-xs uppercase tracking-wide text-muted-foreground">This month</span>
					<span class="text-lg font-semibold tabular-nums text-foreground">
						{reputation.reviews_this_month === 0 ? '0' : `+${reputation.reviews_this_month}`}
					</span>
				</div>

				{#if state === 'early'}
					<span
						class="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-600 dark:text-emerald-400"
					>
						<Sparkles class="h-3.5 w-3.5" />
						Building your reputation
					</span>
				{:else if velocity}
					{@const v = velocity}
					<span
						class={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${v.up ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'}`}
					>
						{#if v.up}
							<TrendingUp class="h-3.5 w-3.5" />
							↑ {v.pct}% vs last month
						{:else}
							<TrendingDown class="h-3.5 w-3.5" />
							{v.pct}% vs last month
						{/if}
					</span>
				{:else}
					<span class="text-xs text-muted-foreground">Review funnel active</span>
				{/if}
			</div>
		</div>
	{/if}
</section>
