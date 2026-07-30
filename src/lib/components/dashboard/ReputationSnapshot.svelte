<script lang="ts">
	import type { DashboardReputation } from '$lib/types/dashboard';
	import SendRequestSheet from '$lib/components/reputation/SendRequestSheet.svelte';
	import { getMemberContext } from '$lib/context/member';

	let { reputation }: { reputation: DashboardReputation | null } = $props();

	const member = getMemberContext();
	const canSendRequests = $derived(member().can_send_review_requests === true);
	let sendOpen = $state(false);

	type State = 'unavailable' | 'feature_disabled' | 'no_reviews' | 'early' | 'healthy';

	const viewState: State = $derived.by(() => {
		if (!reputation) return 'unavailable';
		if (!reputation.funnel_enabled) return 'feature_disabled';
		if (reputation.total_reviews === 0) return 'no_reviews';
		if (reputation.total_reviews < 10) return 'early';
		return 'healthy';
	});

	const showCta = $derived(
		canSendRequests &&
			(viewState === 'no_reviews' || viewState === 'early' || viewState === 'healthy')
	);

	const velocity = $derived.by(() => {
		if (!reputation) return null;
		const { reviews_this_month, reviews_last_month } = reputation;
		if (reviews_this_month === 0 || reviews_last_month === 0) return null;
		const delta = ((reviews_this_month - reviews_last_month) / reviews_last_month) * 100;
		return { pct: Math.round(delta), up: delta >= 0 };
	});
</script>

<section class="widget-card">
	<header class="widget-card__header">
		<h2 class="widget-card__title">Reputation snapshot</h2>
		<a href="/reputation" class="widget-card__link">View all</a>
	</header>

	{#if viewState === 'unavailable'}
		<div class="widget-card__empty">
			<span class="widget-card__empty-icon">
				<i class="ri-star-line"></i>
			</span>
			<p class="widget-card__empty-title">Reputation unavailable</p>
			<p class="widget-card__empty-sub">We couldn't load review stats. Try again soon.</p>
		</div>
	{:else if viewState === 'feature_disabled'}
		<div class="widget-card__empty">
			<span class="widget-card__empty-icon">
				<i class="ri-shield-cross-line"></i>
			</span>
			<p class="widget-card__empty-title">Review automation inactive</p>
			<p class="widget-card__empty-sub">Turn on the review funnel in automation settings.</p>
		</div>
	{:else if viewState === 'no_reviews' && reputation}
		<div class="widget-card__empty rep-empty--active">
			<span class="widget-card__empty-icon rep-empty-icon--active">
				<i class="ri-sparkling-line"></i>
			</span>
			<p class="widget-card__empty-title">Review funnel active</p>
			<p class="widget-card__empty-sub">Waiting for your first review</p>
			{#if reputation.requests_this_month > 0}
				<p class="rep-requests-sent">
					{reputation.requests_this_month} request{reputation.requests_this_month === 1 ? '' : 's'} sent
					this month
				</p>
			{/if}
		</div>
	{:else if reputation}
		<div class="rep-stats">
			<div class="rep-rating">
				<i class="ri-star-fill rep-rating__star"></i>
				<span class="rep-rating__score">{reputation.avg_rating?.toFixed(1) ?? '—'}</span>
				<span class="rep-rating__sub"
					>/ 5 · {reputation.total_reviews} review{reputation.total_reviews === 1 ? '' : 's'}</span
				>
			</div>

			<div class="rep-month">
				<div class="rep-month__col">
					<span class="rep-month__label">This month</span>
					<span class="rep-month__value">
						{reputation.reviews_this_month === 0 ? '0' : `+${reputation.reviews_this_month}`}
					</span>
				</div>

				{#if viewState === 'early'}
					<span class="rep-chip rep-chip--success">
						<i class="ri-sparkling-line"></i>
						Building your reputation
					</span>
				{:else if velocity}
					{@const v = velocity}
					<span class={['rep-chip', v.up ? 'rep-chip--success' : 'rep-chip--warning'].join(' ')}>
						<i class={v.up ? 'ri-arrow-up-line' : 'ri-arrow-down-line'}></i>
						{v.up ? `↑ ${v.pct}%` : `${v.pct}%`} vs last month
					</span>
				{:else}
					<span class="rep-chip rep-chip--neutral">Review funnel active</span>
				{/if}
			</div>
		</div>
	{/if}

	{#if showCta}
		<div class="widget-card__footer">
			<button type="button" class="btn btn--primary rep-cta" onclick={() => (sendOpen = true)}>
				<i class="ri-send-plane-line"></i>
				Send review request
			</button>
		</div>
	{/if}
</section>

{#if canSendRequests}
	<SendRequestSheet bind:open={sendOpen} />
{/if}

<style lang="scss">
	@use '$lib/styles/tokens' as *;

	.rep-empty--active {
		background: var(--success-bg);
	}

	.rep-empty-icon--active {
		background: var(--success-bg);
		color: var(--success-text);
	}

	.rep-requests-sent {
		font-size: $fs-body;
		font-weight: $weight-medium;
		color: var(--success-text);
		margin-top: $space-1;
	}

	.rep-stats {
		padding: $space-5;
		display: flex;
		flex-direction: column;
		gap: $space-4;
	}

	.rep-rating {
		display: flex;
		align-items: baseline;
		gap: $space-2;

		&__star {
			font-size: 2rem;
			color: var(--warning-solid);
			align-self: center;
		}

		&__score {
			font: $weight-semibold 3.2rem/1 $font-display;
			color: var(--color-text-primary);
			letter-spacing: -0.02em;
		}

		&__sub {
			font-size: $fs-body;
			color: var(--color-text-muted);
		}
	}

	.rep-month {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: $space-3;

		&__col {
			display: flex;
			flex-direction: column;
			gap: 2px;
		}

		&__label {
			font-size: $fs-caption;
			text-transform: uppercase;
			letter-spacing: $tracking-label;
			color: var(--color-text-muted);
		}

		&__value {
			font-size: $fs-lg;
			font-weight: $weight-semibold;
			font-variant-numeric: tabular-nums;
			color: var(--color-text-primary);
		}
	}

	.rep-chip {
		display: inline-flex;
		align-items: center;
		gap: $space-1;
		padding: 3px 10px;
		border-radius: $radius-full;
		font-size: $fs-caption;
		font-weight: $weight-medium;

		i {
			font-size: 1.2rem;
		}

		&--success {
			background: var(--success-bg);
			color: var(--success-text);
		}

		&--warning {
			background: var(--warning-bg);
			color: var(--warning-text);
		}

		&--neutral {
			background: var(--color-bg-surface-sunk);
			color: var(--color-text-muted);
		}
	}

	.rep-cta {
		width: 100%;
		height: 36px;
	}
</style>
