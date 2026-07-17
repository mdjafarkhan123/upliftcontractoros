<script lang="ts">
	import type { DashboardMissedCallRecovery } from '$lib/types/dashboard';

	let { stats }: { stats: DashboardMissedCallRecovery } = $props();

	const rate = $derived(
		stats.missed_count > 0 ? Math.round((stats.recovered_count / stats.missed_count) * 100) : null
	);
</script>

<section class="widget-card">
	<header class="widget-card__header">
		<h2 class="widget-card__title">Missed-call recovery</h2>
		<span class="widget-card__meta">This month</span>
	</header>

	{#if stats.missed_count === 0}
		<div class="widget-card__empty">
			<span class="widget-card__empty-icon">
				<i class="ri-phone-line"></i>
			</span>
			<p class="widget-card__empty-title">No missed calls this month</p>
			<p class="widget-card__empty-sub">Every call got through. Nice.</p>
		</div>
	{:else}
		<div class="mcr-stats">
			<div class="mcr-stat">
				<span class="mcr-stat__label">
					<i class="ri-phone-line mcr-stat__icon mcr-stat__icon--danger"></i>
					Missed calls
				</span>
				<span class="mcr-stat__value">{stats.missed_count}</span>
			</div>
			<div class="mcr-stat">
				<span class="mcr-stat__label">
					<i class="ri-phone-line mcr-stat__icon mcr-stat__icon--success"></i>
					Recovered
				</span>
				<span class="mcr-stat__value">
					{rate}%
					<small>{stats.recovered_count} of {stats.missed_count}</small>
				</span>
			</div>
		</div>
	{/if}
</section>

<style lang="scss">
	@use '$lib/styles/tokens' as *;

	.mcr-stats {
		display: grid;
		grid-template-columns: 1fr 1fr;
		border-top: 1px solid var(--color-border);
	}

	.mcr-stat {
		display: flex;
		flex-direction: column;
		gap: $space-1;
		padding: $space-5;

		&:first-child {
			border-right: 1px solid var(--color-border);
		}

		&__label {
			display: flex;
			align-items: center;
			gap: $space-1;
			font-size: $fs-body;
			font-weight: $weight-medium;
			color: var(--color-text-muted);
		}

		&__icon {
			font-size: 1.4rem;

			&--danger {
				color: var(--danger-solid);
			}
			&--success {
				color: var(--success-solid);
			}
		}

		&__value {
			font: $weight-semibold 3.2rem/1 $font-display;
			color: var(--color-text-primary);
			letter-spacing: -0.02em;
			display: flex;
			align-items: baseline;
			gap: $space-2;

			small {
				font-size: $fs-body;
				font-weight: $weight-regular;
				color: var(--color-text-muted);
			}
		}
	}
</style>
