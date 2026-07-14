<script lang="ts">
	import type { DashboardTodayJob } from '$lib/types/dashboard';
	import { prefetchOnIntent } from '$lib/actions/prefetch';
	import { jobDetailStore } from '$lib/stores/jobDetail.svelte';

	let { jobs, timezone }: { jobs: DashboardTodayJob[]; timezone: string } = $props();

	const timeFmt = $derived(
		new Intl.DateTimeFormat('en-US', {
			hour: 'numeric',
			minute: '2-digit',
			timeZone: timezone
		})
	);

	function formatTime(iso: string): string {
		const t = Date.parse(iso);
		return isNaN(t) ? '—' : timeFmt.format(t);
	}
</script>

<section class="widget-card">
	<header class="widget-card__header">
		<div class="widget-card__title-group">
			<h2 class="widget-card__title">Today's schedule</h2>
			{#if jobs.length > 0}
				<span class="widget-card__count">{jobs.length}</span>
			{/if}
		</div>
		<a href="/jobs?status=scheduled" class="widget-card__link">View all</a>
	</header>

	{#if jobs.length === 0}
		<div class="widget-card__empty">
			<span class="widget-card__empty-icon">
				<i class="ri-calendar-schedule-line"></i>
			</span>
			<p class="widget-card__empty-title">Nothing scheduled today</p>
			<p class="widget-card__empty-sub">Jobs starting today will appear here.</p>
		</div>
	{:else}
		<ul class="widget-card__list">
			{#each jobs as job (job.id)}
				<li class="widget-card__list-item">
					<a
						href={`/jobs/${job.id}`}
						use:prefetchOnIntent={() => jobDetailStore.prefetch(job.id)}
						class="widget-card__list-row"
					>
						<span class="schedule-time">
							<i class="ri-time-line"></i>
							<span>{formatTime(job.scheduled_start)}</span>
						</span>
						<span class="widget-card__list-content">
							<span class="widget-card__list-label">{job.title}</span>
							<span class="widget-card__list-sub">{job.contact_name ?? 'No contact'}</span>
						</span>
						{#if job.status === 'in_progress'}
							<span class="job-badge job-badge--progress">In progress</span>
						{:else}
							<span class="job-badge job-badge--scheduled">Scheduled</span>
						{/if}
						<i class="ri-arrow-right-s-line widget-card__chevron"></i>
					</a>
				</li>
			{/each}
		</ul>
	{/if}
</section>

<style lang="scss">
	@use '$lib/styles/tokens' as *;

	.schedule-time {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 2px;
		width: 52px;
		flex-shrink: 0;
		padding: $space-1 $space-2;
		border-radius: $radius-sm;
		background: var(--color-bg-surface-sunk);
		box-shadow: inset 0 0 0 1px var(--color-border);

		i {
			font-size: 1.4rem;
			color: var(--color-text-muted);
		}

		span {
			font-size: $fs-caption;
			font-weight: $weight-semibold;
			font-variant-numeric: tabular-nums;
			color: var(--color-text-primary);
		}
	}

	.job-badge {
		flex-shrink: 0;
		padding: 2px 10px;
		border-radius: $radius-full;
		font-size: $fs-caption;
		font-weight: $weight-medium;

		&--progress {
			background: var(--warning-bg);
			color: var(--warning-text);
		}

		&--scheduled {
			background: var(--info-bg);
			color: var(--info-text);
		}
	}
</style>
