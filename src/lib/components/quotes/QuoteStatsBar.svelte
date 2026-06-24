<script lang="ts">
	import type { Component } from 'svelte';
	import { cn } from '$lib/utils/cn';
	import { formatCurrency } from '$lib/utils/format';
	import { quoteStatsStore } from '$lib/stores/quoteStats.svelte';
	import { Hourglass, Banknote, CircleCheckBig, Timer } from '@lucide/svelte';

	$effect(() => {
		void quoteStatsStore.load();
	});

	const stats = $derived(quoteStatsStore.data);
	const status = $derived(quoteStatsStore.status);
	const showSkeleton = $derived(status === 'loading' && !stats);

	type Tone = 'sky' | 'primary' | 'success' | 'violet';

	const toneBadge: Record<Tone, string> = {
		sky: 'bg-sky-50 text-sky-600 ring-sky-200 dark:bg-sky-500/10 dark:text-sky-400 dark:ring-sky-500/20',
		primary: 'bg-primary/10 text-primary ring-primary/20',
		success:
			'bg-emerald-50 text-emerald-600 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:ring-emerald-500/20',
		violet:
			'bg-violet-50 text-violet-600 ring-violet-200 dark:bg-violet-500/10 dark:text-violet-400 dark:ring-violet-500/20'
	};

	const acceptancePct = $derived(
		stats?.acceptance_rate != null ? `${Math.round(stats.acceptance_rate * 100)}%` : '—'
	);
	const avgDays = $derived(
		stats?.avg_days_to_accept != null
			? stats.avg_days_to_accept < 1
				? '<1'
				: String(Math.round(stats.avg_days_to_accept))
			: '—'
	);

	const cards = $derived<
		{ label: string; value: string; hint: string; icon: Component; tone: Tone }[]
	>(
		stats
			? [
					{
						label: 'Awaiting response',
						value: String(stats.awaiting_count),
						hint: 'Sent or viewed, no reply yet',
						icon: Hourglass,
						tone: 'sky'
					},
					{
						label: 'Open value',
						value: formatCurrency(stats.open_value),
						hint: 'Quotes live with clients',
						icon: Banknote,
						tone: 'primary'
					},
					{
						label: 'Acceptance rate',
						value: acceptancePct,
						hint:
							stats.decided_90 > 0
								? `${stats.accepted_90} of ${stats.decided_90} decided · last 90 days`
								: 'Last 90 days',
						icon: CircleCheckBig,
						tone: 'success'
					},
					{
						label: 'Avg days to accept',
						value: avgDays,
						hint: 'From sent to accepted · last 90 days',
						icon: Timer,
						tone: 'violet'
					}
				]
			: []
	);
</script>

{#if showSkeleton}
	<div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
		{#each Array(4) as _, i (i)}
			<div class="h-[120px] animate-pulse rounded-2xl bg-muted md:h-[132px]"></div>
		{/each}
	</div>
{:else if stats}
	<div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
		{#each cards as card (card.label)}
			<div
				class="flex min-h-[120px] flex-col justify-between rounded-2xl border border-border/70 bg-card p-4 shadow-card md:min-h-[132px] md:p-5 dark:border-white/10"
			>
				<div class="flex items-center justify-between gap-2">
					<span class="text-sm font-medium leading-tight text-muted-foreground">
						{card.label}
					</span>
					<span
						class={cn(
							'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset',
							toneBadge[card.tone]
						)}
					>
						<card.icon class="h-6 w-6" />
					</span>
				</div>
				<div class="mt-2 flex flex-col gap-1">
					<span
						class="text-3xl font-semibold leading-none tracking-tight text-foreground md:text-4xl"
					>
						{card.value}
					</span>
					<span class="text-xs text-muted-foreground">{card.hint}</span>
				</div>
			</div>
		{/each}
	</div>
{/if}
