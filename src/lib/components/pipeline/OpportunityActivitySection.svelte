<script lang="ts">
	import type { OpportunityActivity, OpportunityActivityKind } from '$lib/types/pipeline';

	type Props = {
		activity: OpportunityActivity[];
		hasQuotes: boolean;
		canCreate: boolean;
		newQuoteHref: string;
	};

	let { activity, hasQuotes, canCreate, newQuoteHref }: Props = $props();

	const ICONS: Record<OpportunityActivityKind, string> = {
		stage: 'ri-arrow-left-right-line',
		assignee: 'ri-user-settings-line',
		quote_sent: 'ri-send-plane-line',
		quote_viewed: 'ri-eye-line',
		quote_accepted: 'ri-checkbox-circle-line',
		quote_declined: 'ri-close-circle-line',
		created: 'ri-sparkling-line',
		won: 'ri-trophy-line',
		lost: 'ri-emotion-unhappy-line'
	};

	const TONES: Record<OpportunityActivityKind, string> = {
		stage: 'muted',
		assignee: 'muted',
		quote_sent: 'info',
		quote_viewed: 'warning',
		quote_accepted: 'success',
		quote_declined: 'danger',
		created: 'success',
		won: 'success',
		lost: 'danger'
	};

	function relative(iso: string): string {
		const diffMs = Date.now() - new Date(iso).getTime();
		const m = Math.round(diffMs / 60000);
		if (m < 1) return 'just now';
		if (m < 60) return `${m}m`;
		const h = Math.round(m / 60);
		if (h < 24) return `${h}h`;
		const d = Math.round(h / 24);
		if (d < 30) return `${d}d`;
		const mo = Math.round(d / 30);
		if (mo < 12) return `${mo}mo`;
		return `${Math.round(mo / 12)}y`;
	}
</script>

<section class="opp-section">
	<header class="opp-section__header">
		<div class="opp-section__header-left">
			<i class="ri-pulse-line opp-section__title-icon" aria-hidden="true"></i>
			<h3 class="opp-section__title">Activity</h3>
		</div>
	</header>

	{#if activity.length === 0}
		<div class="opp-section__empty">
			{#if !hasQuotes && canCreate}
				<p>No quotes yet — create one to move this opportunity forward.</p>
				<a href={newQuoteHref} class="opp-section__empty-link">Create a quote →</a>
			{:else}
				<p>No activity yet.</p>
			{/if}
		</div>
	{:else}
		<ul class="opp-section__list">
			{#each activity as a (a.id)}
				<li class="opp-section__item">
					<i
						class="{ICONS[a.kind]} opp-section__item-icon opp-section__item-icon--{TONES[a.kind]}"
						aria-hidden="true"
					></i>
					<div class="opp-section__item-body">
						<p class="opp-section__item-text">{a.summary}</p>
					</div>
					<span class="opp-section__item-time" title={new Date(a.occurred_at).toLocaleString()}>
						{relative(a.occurred_at)}
					</span>
				</li>
			{/each}
		</ul>
	{/if}
</section>
