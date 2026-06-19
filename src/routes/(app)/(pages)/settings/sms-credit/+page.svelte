<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import PageWrapper from '$lib/components/shared/PageWrapper.svelte';
	import { getMemberContext } from '$lib/context/member';
	import { cn } from '$lib/utils/cn';
	import {
		Wallet,
		Send,
		CheckCheck,
		TriangleAlert,
		CalendarClock,
		MessageSquare,
		ArrowDownLeft,
		ArrowUpRight
	} from '@lucide/svelte';

	type LedgerEntryType = 'charge' | 'refund' | 'manual_topup' | 'monthly_grant';
	type LedgerRow = {
		id: string;
		entry_type: LedgerEntryType;
		amount: string;
		balance_after: string;
		note: string | null;
		created_at: string;
	};
	type CreditData = {
		balance: string;
		monthly_included_credit: string;
		last_monthly_grant_at: string | null;
		low_credit: boolean;
		show_cost: boolean;
		per_sms_cost?: string;
		messages_remaining?: number | null;
		usage: {
			sent_this_month: number;
			sent_all_time: number;
			delivered: number;
			failed: number;
		};
		ledger: LedgerRow[];
	};

	const member = getMemberContext();
	let m = $derived(member());

	let data = $state<CreditData | null>(null);
	let loading = $state(true);
	let loadError = $state('');

	onMount(() => {
		if (m.role !== 'admin') {
			void goto('/settings');
			return;
		}
		void load();
	});

	async function load() {
		loading = true;
		loadError = '';
		try {
			const res = await fetch('/api/settings/sms-credit');
			const body = (await res.json()) as { data?: CreditData; error?: string };
			if (!res.ok) throw new Error(body.error ?? 'Failed to load SMS credit');
			data = body.data ?? null;
		} catch (e) {
			loadError = e instanceof Error ? e.message : 'Failed to load SMS credit';
		} finally {
			loading = false;
		}
	}

	const ledgerMeta: Record<
		LedgerEntryType,
		{ label: string; positive: boolean; icon: typeof Send }
	> = {
		charge: { label: 'SMS sent', positive: false, icon: Send },
		refund: { label: 'Refund', positive: true, icon: ArrowDownLeft },
		manual_topup: { label: 'Top-up', positive: true, icon: ArrowUpRight },
		monthly_grant: { label: 'Monthly credit', positive: true, icon: CalendarClock }
	};

	function fmtAmount(amount: string): string {
		const n = Number(amount);
		const sign = n > 0 ? '+' : n < 0 ? '−' : '';
		return `${sign}$${Math.abs(n).toFixed(2)}`;
	}

	function fmtDate(iso: string): string {
		return new Date(iso).toLocaleDateString(undefined, {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		});
	}

	let statCards = $derived(
		data
			? [
					{ label: 'Sent this month', value: data.usage.sent_this_month, icon: Send },
					{ label: 'Sent all-time', value: data.usage.sent_all_time, icon: MessageSquare },
					{ label: 'Delivered', value: data.usage.delivered, icon: CheckCheck },
					{ label: 'Failed', value: data.usage.failed, icon: TriangleAlert }
				]
			: []
	);
</script>

<svelte:head><title>SMS Credits</title></svelte:head>

<PageWrapper
	title="SMS Credits"
	subtitle="Your text-message balance, usage, and recent activity."
	back="/settings"
>
	{#if loading}
		<div class="flex flex-col gap-5" aria-busy="true" aria-label="Loading SMS credit">
			<div class="skeleton-shimmer h-36 w-full rounded-2xl bg-muted"></div>
			<div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
				{#each Array.from({ length: 4 }, (_, i) => i) as i (i)}
					<div class="skeleton-shimmer h-24 w-full rounded-xl bg-muted"></div>
				{/each}
			</div>
			<div class="skeleton-shimmer h-64 w-full rounded-2xl bg-muted"></div>
		</div>
	{:else if loadError}
		<div
			class="flex flex-col items-center justify-center gap-3 rounded-2xl border border-border/60 bg-card px-6 py-16 text-center shadow-card"
		>
			<TriangleAlert class="h-8 w-8 text-muted-foreground/60" />
			<p class="text-sm font-medium text-foreground">{loadError}</p>
			<button
				type="button"
				onclick={load}
				class="rounded-lg border border-border/70 bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted/40"
			>
				Try again
			</button>
		</div>
	{:else if data}
		<div class="flex flex-col gap-5">
			<!-- Low-credit banner -->
			{#if data.low_credit}
				<div
					class="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3.5 dark:border-amber-500/20 dark:bg-amber-500/10"
				>
					<TriangleAlert class="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
					<div class="min-w-0">
						<p class="text-sm font-semibold text-amber-800 dark:text-amber-300">
							Your SMS credit is running low
						</p>
						<p class="mt-0.5 text-xs text-amber-700/90 dark:text-amber-400/80">
							Contact your account manager to top up before sending more texts.
						</p>
					</div>
				</div>
			{/if}

			<!-- Hero balance card -->
			<div
				class="relative overflow-hidden rounded-2xl border border-border/60 bg-card px-5 py-5 shadow-card md:px-6 md:py-6"
			>
				<div class="flex flex-wrap items-end justify-between gap-4">
					<div class="min-w-0">
						<div class="flex items-center gap-2 text-muted-foreground">
							<Wallet class="h-4 w-4" />
							<span class="text-xs font-semibold uppercase tracking-wide">Current balance</span>
						</div>
						<p
							class={cn(
								'mt-2 text-4xl font-bold tabular-nums tracking-tight md:text-5xl',
								Number(data.balance) <= 0 ? 'text-destructive' : 'text-foreground'
							)}
						>
							${data.balance}
						</p>
						{#if data.show_cost && data.messages_remaining != null}
							<p class="mt-1.5 text-sm text-muted-foreground">
								≈ <span class="font-semibold text-foreground tabular-nums"
									>{data.messages_remaining.toLocaleString()}</span
								> texts remaining
							</p>
						{/if}
					</div>
					<div class="flex flex-col items-start gap-1.5 text-xs text-muted-foreground sm:items-end">
						<span class="rounded-full bg-muted/60 px-2.5 py-1 font-medium">
							${data.monthly_included_credit}/mo included
						</span>
						{#if data.show_cost && data.per_sms_cost}
							<span class="tabular-nums">${Number(data.per_sms_cost).toFixed(4)} per text</span>
						{/if}
						{#if data.last_monthly_grant_at}
							<span>Last credit: {fmtDate(data.last_monthly_grant_at)}</span>
						{/if}
					</div>
				</div>
			</div>

			<!-- Usage stats -->
			<div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
				{#each statCards as stat (stat.label)}
					<div
						class="flex flex-col gap-2 rounded-xl border border-border/60 bg-card px-4 py-4 shadow-card"
					>
						<div class="flex items-center gap-2 text-muted-foreground">
							<stat.icon class="h-4 w-4" />
							<span class="truncate text-xs font-medium">{stat.label}</span>
						</div>
						<p class="text-2xl font-semibold tabular-nums text-foreground">
							{stat.value.toLocaleString()}
						</p>
					</div>
				{/each}
			</div>

			<!-- Recent activity ledger -->
			<div class="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-card">
				<header class="border-b border-border/60 px-5 py-4">
					<h2 class="text-sm font-semibold text-foreground">Recent activity</h2>
					<p class="mt-0.5 text-xs text-muted-foreground">
						Charges, refunds, monthly credits, and top-ups.
					</p>
				</header>

				{#if data.ledger.length === 0}
					<div class="flex flex-col items-center justify-center gap-2 px-5 py-12 text-center">
						<MessageSquare class="h-7 w-7 text-muted-foreground/50" />
						<p class="text-sm text-muted-foreground">No activity yet.</p>
					</div>
				{:else}
					<ul class="divide-y divide-border/50">
						{#each data.ledger as row (row.id)}
							{@const meta = ledgerMeta[row.entry_type]}
							<li class="flex items-center gap-3 px-5 py-3.5">
								<div
									class={cn(
										'flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
										meta.positive
											? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400'
											: 'bg-muted text-muted-foreground'
									)}
								>
									<meta.icon class="h-4 w-4" />
								</div>
								<div class="min-w-0 flex-1">
									<p class="truncate text-sm font-medium text-foreground">{meta.label}</p>
									<p class="truncate text-xs text-muted-foreground">
										{fmtDate(row.created_at)}{#if row.note}
											· {row.note}{/if}
									</p>
								</div>
								<div class="shrink-0 text-right">
									<p
										class={cn(
											'text-sm font-semibold tabular-nums',
											meta.positive ? 'text-emerald-600 dark:text-emerald-400' : 'text-foreground'
										)}
									>
										{fmtAmount(row.amount)}
									</p>
									<p class="text-[11px] text-muted-foreground tabular-nums">
										${Number(row.balance_after).toFixed(2)}
									</p>
								</div>
							</li>
						{/each}
					</ul>
				{/if}
			</div>
		</div>
	{/if}
</PageWrapper>
