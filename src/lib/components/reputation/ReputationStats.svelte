<script lang="ts">
	import type { ReputationSummary } from '$lib/types/reputation';
	import { Star, MessageSquare, Send, AlertTriangle } from '@lucide/svelte';

	let { summary }: { summary: ReputationSummary } = $props();

	const showNegative = $derived(summary.negative_count !== null);
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
