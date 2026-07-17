<script lang="ts">
	import type { DashboardPipelineStage } from '$lib/types/dashboard';
	import { formatCurrency } from '$lib/utils/format';

	let { stages, locked = false }: { stages: DashboardPipelineStage[] | null; locked?: boolean } =
		$props();

	const maxCount = $derived(
		stages && stages.length > 0 ? Math.max(...stages.map((s) => s.count), 1) : 1
	);
</script>

<section class="widget-card">
	<header class="widget-card__header">
		<h2 class="widget-card__title">Pipeline snapshot</h2>
		<a href="/pipeline" class="widget-card__link">View all</a>
	</header>

	{#if locked}
		<div class="widget-card__empty">
			<span class="widget-card__empty-icon">
				<i class="ri-lock-line"></i>
			</span>
			<p class="widget-card__empty-title">Pipeline access required</p>
			<p class="widget-card__empty-sub">Ask an admin to grant pipeline visibility.</p>
		</div>
	{:else if !stages || stages.length === 0}
		<div class="widget-card__empty">
			<span class="widget-card__empty-icon">
				<i class="ri-git-branch-line"></i>
			</span>
			<p class="widget-card__empty-title">No stages configured</p>
			<p class="widget-card__empty-sub">Set up your pipeline to see deals flow.</p>
		</div>
	{:else}
		<ul class="widget-card__list">
			{#each stages as s (s.stage_id)}
				<li class="pipeline-row widget-card__list-item">
					<span class="pipeline-row__dot" style:background-color={s.color} aria-hidden="true"
					></span>
					<span class="pipeline-row__content">
						<span class="pipeline-row__name">{s.name}</span>
						<span class="pipeline-row__track">
							<span
								class="pipeline-row__fill"
								style:background-color={s.color}
								style:width={`${(s.count / maxCount) * 100}%`}
							></span>
						</span>
					</span>
					<span class="pipeline-row__stats">
						<span class="pipeline-row__count">{s.count}</span>
						<span class="pipeline-row__value">{formatCurrency(s.value)}</span>
					</span>
				</li>
			{/each}
		</ul>
	{/if}
</section>

<style lang="scss">
	@use '$lib/styles/tokens' as *;

	.pipeline-row {
		display: flex;
		align-items: center;
		gap: $space-3;
		padding: $space-3 $space-4;
		transition: background $duration-fast $ease-standard;

		&:hover {
			background: var(--color-bg-surface-sunk);
		}

		&__dot {
			width: 10px;
			height: 10px;
			flex-shrink: 0;
			border-radius: $radius-full;
		}

		&__content {
			display: flex;
			flex-direction: column;
			flex: 1;
			min-width: 0;
			gap: $space-1;
		}

		&__name {
			font-size: $fs-body;
			font-weight: $weight-medium;
			color: var(--color-text-primary);
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
		}

		&__track {
			height: 6px;
			background: var(--color-bg-surface-sunk);
			border-radius: $radius-full;
			overflow: hidden;
		}

		&__fill {
			height: 100%;
			border-radius: $radius-full;
			transition: width $duration-slow $ease-standard;
		}

		&__stats {
			display: flex;
			flex-direction: column;
			align-items: flex-end;
			flex-shrink: 0;
		}

		&__count {
			font-size: $fs-body;
			font-weight: $weight-semibold;
			font-variant-numeric: tabular-nums;
			color: var(--color-text-primary);
		}

		&__value {
			font-size: $fs-body;
			color: var(--color-text-muted);
		}
	}
</style>
