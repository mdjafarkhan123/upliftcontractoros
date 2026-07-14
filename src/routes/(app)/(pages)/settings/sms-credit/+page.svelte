<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import PageWrapper from '$lib/components/shared/PageWrapper.svelte';
	import { getMemberContext } from '$lib/context/member';

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

	const ledgerMeta: Record<LedgerEntryType, { label: string; positive: boolean; icon: string }> = {
		charge: { label: 'SMS sent', positive: false, icon: 'ri-send-plane-line' },
		refund: { label: 'Refund', positive: true, icon: 'ri-arrow-left-down-line' },
		manual_topup: { label: 'Top-up', positive: true, icon: 'ri-arrow-right-up-line' },
		monthly_grant: { label: 'Monthly credit', positive: true, icon: 'ri-calendar-schedule-line' }
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
					{
						label: 'Sent this month',
						value: data.usage.sent_this_month,
						icon: 'ri-send-plane-line'
					},
					{ label: 'Sent all-time', value: data.usage.sent_all_time, icon: 'ri-message-2-line' },
					{ label: 'Delivered', value: data.usage.delivered, icon: 'ri-check-double-line' },
					{ label: 'Failed', value: data.usage.failed, icon: 'ri-error-warning-line' }
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
		<div class="sms-credit" aria-busy="true" aria-label="Loading SMS credit">
			<div class="skeleton-shimmer sms-credit__sk-hero"></div>
			<div class="sms-credit__stats">
				{#each Array.from({ length: 4 }, (_, i) => i) as i (i)}
					<div class="skeleton-shimmer sms-credit__sk-stat"></div>
				{/each}
			</div>
			<div class="skeleton-shimmer sms-credit__sk-ledger"></div>
		</div>
	{:else if loadError}
		<div class="sms-credit__error">
			<i class="ri-error-warning-line" aria-hidden="true"></i>
			<p>{loadError}</p>
			<Button onclick={load}>Try again</Button>
		</div>
	{:else if data}
		<div class="sms-credit">
			<!-- Low-credit banner -->
			{#if data.low_credit}
				<div class="credit-banner">
					<i class="ri-error-warning-line credit-banner__icon" aria-hidden="true"></i>
					<div>
						<p class="credit-banner__title">Your SMS credit is running low</p>
						<p class="credit-banner__text">
							Contact your account manager to top up before sending more texts.
						</p>
					</div>
				</div>
			{/if}

			<!-- Hero balance card -->
			<div class="sms-credit__hero">
				<div>
					<div class="sms-credit__hero-label">
						<i class="ri-wallet-3-line" aria-hidden="true"></i>
						<span>Current balance</span>
					</div>
					<p
						class="sms-credit__balance"
						class:sms-credit__balance--zero={Number(data.balance) <= 0}
					>
						${data.balance}
					</p>
					{#if data.show_cost && data.messages_remaining != null}
						<p class="sms-credit__remaining">
							≈ <strong>{data.messages_remaining.toLocaleString()}</strong> texts remaining
						</p>
					{/if}
				</div>
				<div class="sms-credit__hero-meta">
					<span class="sms-credit__pill">${data.monthly_included_credit}/mo included</span>
					{#if data.show_cost && data.per_sms_cost}
						<span>${Number(data.per_sms_cost).toFixed(4)} per text</span>
					{/if}
					{#if data.last_monthly_grant_at}
						<span>Last credit: {fmtDate(data.last_monthly_grant_at)}</span>
					{/if}
				</div>
			</div>

			<!-- Usage stats -->
			<div class="sms-credit__stats">
				{#each statCards as stat (stat.label)}
					<div class="sms-credit__stat">
						<div class="sms-credit__stat-label">
							<i class={stat.icon} aria-hidden="true"></i>
							<span>{stat.label}</span>
						</div>
						<p class="sms-credit__stat-value">{stat.value.toLocaleString()}</p>
					</div>
				{/each}
			</div>

			<!-- Recent activity ledger -->
			<div class="sms-credit__ledger">
				<header class="sms-credit__ledger-head">
					<h2 class="sms-credit__ledger-title">Recent activity</h2>
					<p class="sms-credit__ledger-sub">Charges, refunds, monthly credits, and top-ups.</p>
				</header>

				{#if data.ledger.length === 0}
					<div class="sms-credit__ledger-empty">
						<i class="ri-message-2-line" aria-hidden="true"></i>
						<p>No activity yet.</p>
					</div>
				{:else}
					<ul>
						{#each data.ledger as row (row.id)}
							{@const meta = ledgerMeta[row.entry_type]}
							<li class="sms-credit__row">
								<div
									class="sms-credit__row-icon"
									class:sms-credit__row-icon--positive={meta.positive}
								>
									<i class={meta.icon} aria-hidden="true"></i>
								</div>
								<div class="sms-credit__row-main">
									<p class="sms-credit__row-label">{meta.label}</p>
									<p class="sms-credit__row-meta">
										{fmtDate(row.created_at)}{#if row.note}
											· {row.note}{/if}
									</p>
								</div>
								<div class="sms-credit__row-amounts">
									<p
										class="sms-credit__row-amount"
										class:sms-credit__row-amount--positive={meta.positive}
									>
										{fmtAmount(row.amount)}
									</p>
									<p class="sms-credit__row-balance">${Number(row.balance_after).toFixed(2)}</p>
								</div>
							</li>
						{/each}
					</ul>
				{/if}
			</div>
		</div>
	{/if}
</PageWrapper>
