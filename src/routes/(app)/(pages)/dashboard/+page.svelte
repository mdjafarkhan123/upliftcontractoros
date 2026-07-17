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

{#snippet periodToggle()}
	<div role="group" aria-label="Time period" class="period-toggle">
		{#each [{ value: 'month', label: 'Month' }, { value: 'year', label: 'Year' }] as opt (opt.value)}
			{@const active = period === opt.value}
			<button
				type="button"
				aria-pressed={active}
				onclick={() => dashboardStore.setPeriod(opt.value as 'month' | 'year')}
				class={['period-toggle__btn', active && 'period-toggle__btn--active']
					.filter(Boolean)
					.join(' ')}
			>
				{opt.label}
			</button>
		{/each}
	</div>
{/snippet}

<PageWrapper title="Dashboard" subtitle={`Welcome back to ${org().name}`}>
	{#if showSkeleton}
		<div class="dashboard-skeleton">
			<div class="dashboard-skeleton__kpi">
				{#each Array(4) as _, i (i)}
					<div class="skeleton-shimmer dashboard-skeleton__tile"></div>
				{/each}
			</div>
			<div class="skeleton-shimmer dashboard-skeleton__bar"></div>
			<div class="dashboard-skeleton__row">
				<div class="skeleton-shimmer dashboard-skeleton__block"></div>
				<div class="skeleton-shimmer dashboard-skeleton__block"></div>
			</div>
		</div>
	{:else if showError}
		<div class="dashboard-error">
			<p class="dashboard-error__title">Couldn't load dashboard</p>
			<p class="dashboard-error__sub">{dashboardStore.error}</p>
			<button
				type="button"
				class="btn btn--ghost dashboard-error__retry"
				onclick={() => dashboardStore.load(true)}
			>
				Try again
			</button>
		</div>
	{:else if summary}
		{@const kpis = summary.kpis}
		{@const locks = summary.locks}

		<div class="dashboard">
			<!-- Control row: quick actions + period toggle -->
			<div class="dashboard__control-row">
				<QuickActions />
				<div class="dashboard__period">{@render periodToggle()}</div>
			</div>

			<!-- KPI grid: 5 metric cards -->
			<div class="dashboard__kpi-grid">
				<KpiCard
					label={`Leads this ${periodWord}`}
					value={String(kpis.leads.new_this_period)}
					trend={countTrend(kpis.leads.new_this_period, kpis.leads.new_last_period, periodWord)}
					hint={kpis.leads.conversion_rate !== null
						? `${pct(kpis.leads.conversion_rate)} converted`
						: undefined}
					iconClass="ri-user-add-line"
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
					iconClass="ri-trophy-line"
					tone="success"
					href="/pipeline"
				/>
				<KpiCard
					label={`Revenue this ${periodWord}`}
					value={kpis.revenue ? formatCurrency(kpis.revenue.this_period) : '$0.00'}
					trend={kpis.revenue
						? moneyTrend(
								Number(kpis.revenue.this_period),
								Number(kpis.revenue.last_period),
								periodWord
							)
						: undefined}
					hint={kpis.revenue ? 'Payments received' : 'Revenue requires permission'}
					iconClass="ri-money-dollar-circle-line"
					tone="success"
					locked={locks.revenue_locked}
					lockedMessage="Revenue access required"
					href="/invoices?status=paid"
				/>
				<KpiCard
					label="Outstanding"
					value={kpis.revenue ? formatCurrency(kpis.revenue.outstanding) : '$0.00'}
					hint={kpis.revenue ? 'Sent + partially paid' : 'Revenue requires permission'}
					iconClass="ri-wallet-3-line"
					tone="warning"
					locked={locks.revenue_locked}
					lockedMessage="Revenue access required"
					href="/invoices"
				/>
				<KpiCard
					label="Money on the table"
					value={formatCurrency(summary.attention.quotes_awaiting_total)}
					hint={`${summary.attention.quotes_awaiting_count} quote${summary.attention.quotes_awaiting_count === 1 ? '' : 's'} sent or viewed`}
					iconClass="ri-hand-coin-line"
					tone="default"
					href="/quotes?status=sent"
				/>
			</div>

			<!-- Action row: today schedule + missed call + attention list -->
			<div
				class={[
					'dashboard__action-row',
					summary.missed_call_recovery
						? 'dashboard__action-row--three'
						: 'dashboard__action-row--two'
				].join(' ')}
			>
				<TodaySchedule jobs={summary.today_schedule} timezone={summary.timezone} />
				{#if summary.missed_call_recovery}
					<MissedCallRecovery stats={summary.missed_call_recovery} />
				{/if}
				<AttentionList attention={summary.attention} />
			</div>

			<!-- Analytics row: pipeline + reputation + activity -->
			<div class="dashboard__analytics-row">
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

<style lang="scss">
	@use '$lib/styles/tokens' as *;

	// ── Layout ────────────────────────────────────────────────
	.dashboard {
		display: flex;
		flex-direction: column;
		gap: $space-6;

		&__control-row {
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: $space-3;
			flex-wrap: wrap;
		}

		&__period {
			flex-shrink: 0;
		}

		&__kpi-grid {
			display: grid;
			grid-template-columns: repeat(2, 1fr);
			gap: $space-3;

			@media (min-width: $bp-tablet) {
				grid-template-columns: repeat(5, 1fr);
				gap: $space-4;
			}
		}

		&__action-row {
			display: grid;
			gap: $space-4;

			@media (min-width: $bp-tablet) {
				grid-template-columns: repeat(2, 1fr);
			}

			&--three {
				@media (min-width: $bp-tablet) {
					grid-template-columns: repeat(3, 1fr);
				}
			}
		}

		&__analytics-row {
			display: grid;
			gap: $space-4;

			@media (min-width: $bp-tablet) {
				grid-template-columns: repeat(3, 1fr);
			}
		}
	}

	// ── Period Toggle ────────────────────────────────────────
	.period-toggle {
		display: inline-flex;
		align-items: center;
		padding: 3px;
		border-radius: $radius-md;
		border: 1px solid var(--color-border);
		background: var(--color-bg-surface);

		&__btn {
			display: inline-flex;
			align-items: center;
			justify-content: center;
			min-height: 32px;
			padding: 0 $space-3;
			border-radius: $radius-sm;
			border: none;
			background: transparent;
			font-size: $fs-body;
			font-weight: $weight-medium;
			color: var(--color-text-muted);
			cursor: pointer;
			transition:
				background $duration-fast $ease-standard,
				color $duration-fast $ease-standard;

			&:hover:not(&--active) {
				color: var(--color-text-primary);
			}

			&--active {
				background: var(--color-brand-strong);
				color: var(--color-text-on-brand);
				box-shadow: var(--shadow-xs);
			}
		}
	}

	// ── Skeleton ─────────────────────────────────────────────
	.dashboard-skeleton {
		display: flex;
		flex-direction: column;
		gap: $space-6;

		&__kpi {
			display: grid;
			grid-template-columns: repeat(2, 1fr);
			gap: $space-3;

			@media (min-width: $bp-tablet) {
				grid-template-columns: repeat(4, 1fr);
				gap: $space-4;
			}
		}

		&__tile {
			height: 160px;
			border-radius: $radius-2xl;
		}
		&__bar {
			height: 56px;
			border-radius: $radius-2xl;
		}

		&__row {
			display: grid;
			gap: $space-4;

			@media (min-width: $bp-tablet) {
				grid-template-columns: 1fr 1fr;
			}
		}

		&__block {
			height: 280px;
			border-radius: $radius-2xl;
		}
	}

	// ── Error state ──────────────────────────────────────────
	.dashboard-error {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: $space-2;
		padding: $space-8 $space-6;
		border-radius: $radius-2xl;
		border: 1px solid var(--danger-bg);
		background: var(--danger-bg);
		text-align: center;

		&__title {
			font-size: $fs-body;
			font-weight: $weight-medium;
			color: var(--danger-text);
		}

		&__sub {
			font-size: $fs-body;
			color: var(--color-text-muted);
		}

		&__retry {
			margin-top: $space-1;
			font-size: $fs-body;
			color: var(--color-brand);
		}
	}
</style>
