<script lang="ts">
	import { goto } from '$app/navigation';
	import type {
		DashboardActivityRow,
		DashboardActivityIcon,
		DashboardActivityTone
	} from '$lib/types/dashboard';

	let { rows }: { rows: DashboardActivityRow[] } = $props();

	const ICONS: Record<DashboardActivityIcon, string> = {
		payment: 'ri-receipt-line',
		quote_accepted: 'ri-checkbox-circle-line',
		quote_viewed: 'ri-eye-line',
		quote_declined: 'ri-close-circle-line',
		quote_sent: 'ri-send-plane-line',
		opportunity_created: 'ri-sparkling-line',
		opportunity_stage_changed: 'ri-arrow-left-right-line',
		opportunity_assignee_changed: 'ri-user-settings-line',
		opportunity_won: 'ri-trophy-line',
		opportunity_lost: 'ri-arrow-down-line',
		job_completed: 'ri-briefcase-line',
		lead: 'ri-user-add-line',
		contact_became_customer: 'ri-user-follow-line',
		communication_preference: 'ri-forbid-2-line',
		review_received: 'ri-star-line'
	};

	const TONE: Record<DashboardActivityTone, string> = {
		neutral: 'widget-card__list-icon--info',
		positive: 'widget-card__list-icon--success',
		attention: 'widget-card__list-icon--warning',
		negative: 'widget-card__list-icon--danger'
	};

	const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
	function relative(iso: string): string {
		const ms = Date.parse(iso) - Date.now();
		const abs = Math.abs(ms);
		const min = 60_000,
			hr = 3_600_000,
			day = 86_400_000;
		if (abs < hr) return rtf.format(Math.round(ms / min), 'minute');
		if (abs < day) return rtf.format(Math.round(ms / hr), 'hour');
		if (abs < day * 30) return rtf.format(Math.round(ms / day), 'day');
		return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
	}
</script>

<section class="widget-card">
	<header class="widget-card__header">
		<h2 class="widget-card__title">Recent activity</h2>
	</header>

	{#if rows.length === 0}
		<div class="widget-card__empty">
			<span class="widget-card__empty-icon">
				<i class="ri-pulse-line"></i>
			</span>
			<p class="widget-card__empty-title">No activity yet</p>
			<p class="widget-card__empty-sub">
				As leads, quotes, jobs, and payments come in, they'll show up here.
			</p>
		</div>
	{:else}
		<ul class="widget-card__list">
			{#each rows as row (row.id)}
				{@const iconClass = ICONS[row.icon_key]}
				{#if iconClass}
					<li class="widget-card__list-item">
						<button
							type="button"
							onclick={() => goto(row.target_route)}
							class="widget-card__list-row"
						>
							<span class={['widget-card__list-icon', TONE[row.tone]].join(' ')}>
								<i class={iconClass}></i>
							</span>
							<span class="widget-card__list-content">
								<span class="widget-card__list-label">{row.label}</span>
								<span class="widget-card__list-sub">{relative(row.occurred_at)}</span>
							</span>
						</button>
					</li>
				{/if}
			{/each}
		</ul>
	{/if}
</section>
