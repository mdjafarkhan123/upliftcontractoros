<script lang="ts">
	import PageWrapper from '$lib/components/shared/PageWrapper.svelte';
	import KpiCard from '$lib/components/dashboard/KpiCard.svelte';
	import AttentionList from '$lib/components/dashboard/AttentionList.svelte';
	import PipelineSnapshot from '$lib/components/dashboard/PipelineSnapshot.svelte';
	import RecentActivity from '$lib/components/dashboard/RecentActivity.svelte';
	import ReputationSnapshot from '$lib/components/dashboard/ReputationSnapshot.svelte';
	import { dashboardStore } from '$lib/stores/dashboard.svelte';
	import { getOrgContext } from '$lib/context/org';
	import { formatCurrency } from '$lib/utils/format';
	import { UserPlus, Trophy, DollarSign, Wallet } from '@lucide/svelte';

	const org = getOrgContext();

	$effect(() => {
		void dashboardStore.load();
	});

	const summary = $derived(dashboardStore.data);
	const status = $derived(dashboardStore.status);
	const showSkeleton = $derived(status === 'loading' && !summary);
	const showError = $derived(status === 'error' && !summary);

	function pct(n: number | null): string {
		if (n === null) return '—';
		return `${Math.round(n * 100)}%`;
	}
</script>

<svelte:head><title>Dashboard</title></svelte:head>

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
			<!-- Mobile: Attention first -->
			<div class="md:hidden">
				<AttentionList attention={summary.attention} />
			</div>

			<!-- KPI grid: 4 cards by question -->
			<div class="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4">
				<KpiCard
					label="Leads this month"
					value={String(kpis.leads.new_this_month)}
					hint={kpis.leads.conversion_rate !== null
						? `${pct(kpis.leads.conversion_rate)} converted`
						: 'Share your number to start'}
					icon={UserPlus}
					tone="default"
					featured
					href="/contacts"
				/>
				<KpiCard
					label="Jobs won this month"
					value={String(kpis.jobs_won.count_this_month)}
					hint={`${formatCurrency(kpis.jobs_won.value_this_month)} in deal value`}
					icon={Trophy}
					tone="success"
					href="/pipeline"
				/>
				<KpiCard
					label="Revenue this month"
					value={kpis.revenue ? formatCurrency(kpis.revenue.this_month) : '$0.00'}
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
			</div>

			<!-- Desktop: Attention after KPIs -->
			<div class="hidden md:block">
				<AttentionList attention={summary.attention} />
			</div>

			<!-- Bottom grid: left stacks Pipeline + Reputation, right is Activity full-height -->
			<div class="grid gap-4 lg:grid-cols-[5fr_7fr]">
				<div class="flex flex-col gap-4">
					<PipelineSnapshot
						stages={summary.pipeline_snapshot}
						locked={summary.locks.pipeline_locked}
					/>
					<!-- Reputation: desktop placement (under Pipeline) -->
					<div class="hidden lg:block">
						<ReputationSnapshot reputation={summary.reputation} />
					</div>
				</div>
				<RecentActivity rows={summary.recent_activity} />
			</div>

			<!-- Reputation: mobile placement (last, lowest priority) -->
			<div class="lg:hidden">
				<ReputationSnapshot reputation={summary.reputation} />
			</div>
		</div>
	{/if}
</PageWrapper>
