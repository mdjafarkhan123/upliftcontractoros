<script lang="ts">
	import PageWrapper from '$lib/components/shared/PageWrapper.svelte';
	import KpiCard from '$lib/components/dashboard/KpiCard.svelte';
	import QuickActions from '$lib/components/dashboard/QuickActions.svelte';
	import TodaySchedule from '$lib/components/dashboard/TodaySchedule.svelte';
	import MissedCallRecovery from '$lib/components/dashboard/MissedCallRecovery.svelte';
	import AttentionList from '$lib/components/dashboard/AttentionList.svelte';
	import PipelineSnapshot from '$lib/components/dashboard/PipelineSnapshot.svelte';
	import RecentActivity from '$lib/components/dashboard/RecentActivity.svelte';
	import ReputationSnapshot from '$lib/components/dashboard/ReputationSnapshot.svelte';
	import { dashboardStore } from '$lib/stores/dashboard.svelte';
	import { getOrgContext } from '$lib/context/org';
	import { formatCurrency } from '$lib/utils/format';
	import { UserPlus, Trophy, DollarSign, Wallet, HandCoins } from '@lucide/svelte';

	const org = getOrgContext();

	$effect(() => {
		void dashboardStore.load();
	});

	const summary = $derived(dashboardStore.data);
	const status = $derived(dashboardStore.status);
	const period = $derived(dashboardStore.period);
	const periodWord = $derived(period === 'year' ? 'year' : 'month');
	const showSkeleton = $derived(status === 'loading' && !summary);
	const showError = $derived(status === 'error' && !summary);

	function pct(n: number | null): string {
		if (n === null) return '—';
		return `${Math.round(n * 100)}%`;
	}

	type Trend = { label: string; direction: 'up' | 'down' | 'flat'; positive: boolean };

	/** Count delta vs the prior period → labelled chip. */
	function countTrend(current: number, previous: number, word: string): Trend {
		const delta = current - previous;
		if (delta === 0)
			return { label: `No change vs last ${word}`, direction: 'flat', positive: true };
		const sign = delta > 0 ? '+' : '−';
		return {
			label: `${sign}${Math.abs(delta)} vs last ${word}`,
			direction: delta > 0 ? 'up' : 'down',
			positive: delta > 0
		};
	}

	/** Percentage delta vs the prior period for monetary flows. */
	function moneyTrend(current: number, previous: number, word: string): Trend {
		if (previous === 0) {
			if (current === 0)
				return { label: `No change vs last ${word}`, direction: 'flat', positive: true };
			return { label: `New this ${word}`, direction: 'up', positive: true };
		}
		const p = Math.round(((current - previous) / previous) * 100);
		if (p === 0) return { label: `No change vs last ${word}`, direction: 'flat', positive: true };
		const sign = p > 0 ? '+' : '−';
		return {
			label: `${sign}${Math.abs(p)}% vs last ${word}`,
			direction: p > 0 ? 'up' : 'down',
			positive: p > 0
		};
	}
</script>

<svelte:head><title>Dashboard</title></svelte:head>

<!-- Period toggle, shared by both header variants -->
{#snippet periodToggle()}
	<div
		role="group"
		aria-label="Time period"
		class="inline-flex shrink-0 items-center rounded-lg border border-border/70 bg-card p-0.5 dark:border-white/10"
	>
		{#each [{ value: 'month', label: 'Month' }, { value: 'year', label: 'Year' }] as opt (opt.value)}
			{@const active = period === opt.value}
			<button
				type="button"
				aria-pressed={active}
				onclick={() => dashboardStore.setPeriod(opt.value as 'month' | 'year')}
				class={[
					'inline-flex min-h-[44px] items-center rounded-md px-3.5 text-xs font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:min-h-[36px]',
					active
						? 'bg-primary text-primary-foreground shadow-sm'
						: 'text-muted-foreground hover:text-foreground'
				]}
			>
				{opt.label}
			</button>
		{/each}
	</div>
{/snippet}

<PageWrapper title="Dashboard" subtitle={`Welcome back to ${org().name}`}>
	{#if showSkeleton}
		<div class="space-y-4 md:space-y-6">
			<div class="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4">
				{#each Array(4) as _, i (i)}
					<div class="h-[150px] animate-pulse rounded-2xl bg-muted md:h-[170px]"></div>
				{/each}
			</div>
			<div class="h-[200px] animate-pulse rounded-2xl bg-muted"></div>
			<div class="grid gap-4 lg:grid-cols-2">
				<div class="h-[280px] animate-pulse rounded-2xl bg-muted"></div>
				<div class="h-[280px] animate-pulse rounded-2xl bg-muted"></div>
			</div>
		</div>
	{:else if showError}
		<div class="rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-6 text-center">
			<p class="text-sm font-medium text-destructive">Couldn't load dashboard</p>
			<p class="mt-1 text-xs text-muted-foreground">{dashboardStore.error}</p>
			<button
				type="button"
				class="mt-3 text-sm font-medium text-primary hover:underline"
				onclick={() => dashboardStore.load(true)}
			>
				Try again
			</button>
		</div>
	{:else if summary}
		{@const kpis = summary.kpis}
		{@const locks = summary.locks}

		<div class="space-y-4 md:space-y-6">
			<!-- Control row: quick actions (left) + period toggle (right).
			     Stacks on mobile; the toggle sits just above the KPI grid it scopes. -->
			<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
				<QuickActions />
				<div class="flex shrink-0 justify-end">{@render periodToggle()}</div>
			</div>

			<!-- KPI grid: 5 cards by question, with period-over-period trend -->
			<div class="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-5">
				<KpiCard
					label={`Leads this ${periodWord}`}
					value={String(kpis.leads.new_this_period)}
					trend={countTrend(kpis.leads.new_this_period, kpis.leads.new_last_period, periodWord)}
					hint={kpis.leads.conversion_rate !== null
						? `${pct(kpis.leads.conversion_rate)} converted`
						: undefined}
					icon={UserPlus}
					tone="default"
					featured
					href="/contacts"
				/>
				<KpiCard
					label={`Jobs won this ${periodWord}`}
					value={String(kpis.jobs_won.count_this_period)}
					trend={countTrend(
						kpis.jobs_won.count_this_period,
						kpis.jobs_won.count_last_period,
						periodWord
					)}
					hint={`${formatCurrency(kpis.jobs_won.value_this_period)} in deal value`}
					icon={Trophy}
					tone="success"
					href="/pipeline"
				/>
				<KpiCard
					label={`Revenue this ${periodWord}`}
					value={kpis.revenue ? formatCurrency(kpis.revenue.this_period) : '$0.00'}
					trend={kpis.revenue
						? moneyTrend(Number(kpis.revenue.this_period), Number(kpis.revenue.last_period), periodWord)
						: undefined}
					hint={kpis.revenue ? 'Payments received' : 'Revenue requires permission'}
					icon={DollarSign}
					tone="success"
					locked={locks.revenue_locked}
					lockedMessage="Revenue access required"
					href="/invoices?status=paid"
				/>
				<KpiCard
					label="Outstanding"
					value={kpis.revenue ? formatCurrency(kpis.revenue.outstanding) : '$0.00'}
					hint={kpis.revenue ? 'Sent + partially paid' : 'Revenue requires permission'}
					icon={Wallet}
					tone="warning"
					locked={locks.revenue_locked}
					lockedMessage="Revenue access required"
					href="/invoices"
				/>
				<KpiCard
					label="Money on the table"
					value={formatCurrency(summary.attention.quotes_awaiting_total)}
					hint={`${summary.attention.quotes_awaiting_count} quote${summary.attention.quotes_awaiting_count === 1 ? '' : 's'} sent or viewed`}
					icon={HandCoins}
					tone="default"
					href="/quotes?status=sent"
				/>
			</div>

			<!-- Action row: today's work, missed-call recovery, what needs attention.
			     Collapses to 2-up when missed-call recovery isn't available (no empty third). -->
			<div
				class={[
					'grid gap-4',
					summary.missed_call_recovery ? 'lg:grid-cols-3' : 'lg:grid-cols-2'
				]}
			>
				<TodaySchedule jobs={summary.today_schedule} timezone={summary.timezone} />
				{#if summary.missed_call_recovery}
					<MissedCallRecovery stats={summary.missed_call_recovery} />
				{/if}
				<AttentionList attention={summary.attention} />
			</div>

			<!-- Analytics row: pipeline, reputation, recent activity as equal thirds -->
			<div class="grid gap-4 lg:grid-cols-3">
				<PipelineSnapshot
					stages={summary.pipeline_snapshot}
					locked={summary.locks.pipeline_locked}
				/>
				<ReputationSnapshot reputation={summary.reputation} />
				<RecentActivity rows={summary.recent_activity} />
			</div>
		</div>
	{/if}
</PageWrapper>
