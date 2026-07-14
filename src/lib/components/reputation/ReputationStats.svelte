<script lang="ts">
	import type { ReputationSummary } from '$lib/types/reputation';
	import KpiStrip, { type KpiTile } from '$lib/components/shared/KpiStrip.svelte';

	let { summary }: { summary: ReputationSummary } = $props();

	const showNegative = $derived(summary.negative_count !== null);

	// Thin adapter over the shared KpiStrip (same chassis as Contacts / Quotes /
	// Jobs / Invoices). The Google-sync line below stays — it's reputation-specific.
	const tiles = $derived<KpiTile[]>([
		{
			key: 'total',
			label: 'Total reviews',
			value: summary.total_reviews,
			icon: 'ri-chat-3-line',
			tone: 'brand'
		},
		{
			key: 'avg',
			label: 'Avg score',
			value: summary.avg_score !== null ? summary.avg_score.toFixed(2) : '—',
			icon: 'ri-star-line',
			tone: 'warn'
		},
		{
			key: 'month',
			label: 'This month',
			value: summary.reviews_this_month,
			icon: 'ri-calendar-line',
			tone: 'info'
		},
		showNegative
			? {
					key: 'negative',
					label: 'Open negative',
					value: summary.negative_count ?? 0,
					icon: 'ri-alert-line',
					tone: 'violet'
				}
			: {
					key: 'pending',
					label: 'Pending',
					value: summary.pending_requests,
					icon: 'ri-send-plane-line',
					tone: 'violet'
				}
	]);

	function relativeFromNow(iso: string): string {
		const diff = Math.max(0, Date.now() - new Date(iso).getTime());
		const min = 60_000;
		const hr = 60 * min;
		const day = 24 * hr;
		if (diff < min) return 'just now';
		if (diff < hr) {
			const m = Math.floor(diff / min);
			return `${m} minute${m === 1 ? '' : 's'} ago`;
		}
		if (diff < day) {
			const h = Math.floor(diff / hr);
			return `${h} hour${h === 1 ? '' : 's'} ago`;
		}
		if (diff < 30 * day) {
			const d = Math.floor(diff / day);
			return `${d} day${d === 1 ? '' : 's'} ago`;
		}
		return new Date(iso).toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		});
	}

	const syncedAtRelative = $derived(
		summary.last_review_check_at ? relativeFromNow(summary.last_review_check_at) : null
	);
	const syncedAtAbsolute = $derived(
		summary.last_review_check_at ? new Date(summary.last_review_check_at).toLocaleString() : ''
	);
	const hasCount = $derived(
		summary.last_known_review_count !== null && summary.last_known_review_count > 0
	);
	const syncLine = $derived(
		syncedAtRelative === null
			? 'Google reviews unavailable · Not yet synced'
			: hasCount
				? `${summary.last_known_review_count} Google review${summary.last_known_review_count === 1 ? '' : 's'} · Last synced ${syncedAtRelative}`
				: `Google reviews unavailable · Last synced ${syncedAtRelative}`
	);
</script>

<div class="rep-stats">
	<KpiStrip {tiles} ariaLabel="Reputation stats" />

	<div class="rep-sync" title={syncedAtAbsolute}>
		<i class="ri-refresh-line" aria-hidden="true"></i>
		<span>{syncLine}</span>
	</div>
</div>
