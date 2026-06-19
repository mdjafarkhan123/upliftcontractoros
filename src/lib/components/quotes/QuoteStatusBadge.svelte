<script lang="ts">
	import { cn } from '$lib/utils/cn';
	import type { QuoteStatus } from '$lib/types/quotes';

	let {
		status,
		version,
		class: className
	}: { status: QuoteStatus; version?: number; class?: string } = $props();

	// Color rules (PLAN §4): Gray = waiting (Sent, Expired) · Blue = engaged (Viewed) ·
	// Orange = action needed (Changes requested) · Green = success (Accepted only) ·
	// Red = dead (Declined). Viewed is always blue, never green.
	const styles: Record<QuoteStatus, string> = {
		draft: 'bg-muted text-muted-foreground',
		sent: 'bg-zinc-500/15 text-zinc-600 dark:text-zinc-400',
		viewed: 'bg-blue-500/15 text-blue-600 ring-1 ring-blue-500/30 dark:text-blue-400',
		accepted: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
		declined: 'bg-rose-500/15 text-rose-600 dark:text-rose-400',
		expired: 'bg-zinc-500/15 text-zinc-600 dark:text-zinc-400',
		changes_requested: 'bg-amber-500/20 text-amber-700 dark:text-amber-300 ring-1 ring-amber-500/30'
	};

	const labels: Record<QuoteStatus, string> = {
		draft: 'Draft',
		sent: 'Sent',
		viewed: 'Viewed',
		accepted: 'Accepted',
		declined: 'Declined',
		expired: 'Expired',
		changes_requested: 'Changes requested'
	};

	// Version is subtle but tracked: "Sent (v2)", "Viewed (v3)". Only shown past v1, and
	// only for statuses where the version is meaningful to the contractor.
	const showVersion = $derived(
		version != null &&
			version > 1 &&
			(status === 'sent' || status === 'viewed' || status === 'changes_requested')
	);
</script>

<span
	class={cn(
		'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
		styles[status],
		className
	)}
>
	{#if status === 'viewed'}
		<span class="mr-1" aria-hidden="true">👀</span>
	{/if}
	{labels[status]}{#if showVersion}&nbsp;(v{version}){/if}
</span>
