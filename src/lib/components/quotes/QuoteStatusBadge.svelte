<script lang="ts">
	import { cn } from '$lib/utils/cn';
	import type { QuoteStatus } from '$lib/types/quotes';

	let { status, class: className }: { status: QuoteStatus; class?: string } = $props();

	const styles: Record<QuoteStatus, string> = {
		draft: 'bg-muted text-muted-foreground',
		sent: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
		viewed:
			'bg-amber-500/15 text-amber-700 ring-1 ring-amber-500/40 dark:text-amber-300 dark:ring-amber-500/40',
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
	{labels[status]}
</span>
