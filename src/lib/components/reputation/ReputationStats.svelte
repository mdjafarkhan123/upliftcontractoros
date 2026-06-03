<script lang="ts">
	import type { ReputationSummary } from '$lib/types/reputation';
	import { Star, MessageSquare, Send, AlertTriangle, RefreshCw } from '@lucide/svelte';

	let { summary }: { summary: ReputationSummary } = $props();

	const showNegative = $derived(summary.negative_count !== null);

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

<div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
	<div class="rounded-xl border border-border bg-card p-4">
		<div class="flex items-center gap-2 text-muted-foreground">
			<MessageSquare class="h-4 w-4" />
			<span class="text-xs font-medium uppercase tracking-wide">Total reviews</span>
		</div>
		<p class="mt-2 text-2xl font-semibold text-foreground">{summary.total_reviews}</p>
	</div>
	<div class="rounded-xl border border-border bg-card p-4">
		<div class="flex items-center gap-2 text-muted-foreground">
			<Star class="h-4 w-4" />
			<span class="text-xs font-medium uppercase tracking-wide">Avg score</span>
		</div>
		<p class="mt-2 text-2xl font-semibold text-foreground">
			{summary.avg_score !== null ? summary.avg_score.toFixed(2) : '—'}
		</p>
	</div>
	<div class="rounded-xl border border-border bg-card p-4">
		<div class="flex items-center gap-2 text-muted-foreground">
			<MessageSquare class="h-4 w-4" />
			<span class="text-xs font-medium uppercase tracking-wide">This month</span>
		</div>
		<p class="mt-2 text-2xl font-semibold text-foreground">{summary.reviews_this_month}</p>
	</div>
	<div class="rounded-xl border border-border bg-card p-4">
		<div class="flex items-center gap-2 text-muted-foreground">
			{#if showNegative}
				<AlertTriangle class="h-4 w-4" />
				<span class="text-xs font-medium uppercase tracking-wide">Open negative</span>
			{:else}
				<Send class="h-4 w-4" />
				<span class="text-xs font-medium uppercase tracking-wide">Pending</span>
			{/if}
		</div>
		<p class="mt-2 text-2xl font-semibold text-foreground">
			{showNegative ? summary.negative_count : summary.pending_requests}
		</p>
	</div>
</div>

<div class="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground" title={syncedAtAbsolute}>
	<RefreshCw class="h-3.5 w-3.5" />
	<span>{syncLine}</span>
</div>
