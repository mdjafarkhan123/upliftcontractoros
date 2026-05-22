<script lang="ts">
	import QuoteStatusBadge from './QuoteStatusBadge.svelte';
	import { formatCurrency } from '$lib/utils/format';
	import type { QuoteListItem } from '$lib/types/quotes';
	import { ChevronRight } from '@lucide/svelte';

	let { quote }: { quote: QuoteListItem } = $props();

	const sentLabel = $derived(
		quote.sent_at ? new Date(quote.sent_at).toLocaleDateString('en-US') : null
	);
</script>

<a
	href={`/quotes/${quote.id}`}
	class="group flex items-center gap-3 rounded-xl border border-border/70 bg-card px-4 py-3 shadow-card transition-all duration-150 ease-out hover:border-primary/30 hover:bg-card-raised hover:shadow-dropdown active:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:border-white/10"
>
	<div class="min-w-0 flex-1">
		<div class="flex items-center gap-2">
			<span class="font-mono text-sm font-semibold text-foreground"
				>{quote.quote_number_display}</span
			>
			<QuoteStatusBadge status={quote.status} />
		</div>
		<p class="mt-1 truncate text-sm text-muted-foreground">
			{quote.contact_name} &middot; {quote.title}
		</p>
		{#if sentLabel}
			<p class="mt-0.5 text-xs text-muted-foreground">Sent {sentLabel}</p>
		{/if}
	</div>
	<div class="text-right">
		<div class="text-sm font-semibold tabular-nums text-foreground">
			{formatCurrency(quote.total)}
		</div>
	</div>
	<ChevronRight
		class="h-4 w-4 shrink-0 text-muted-foreground/60 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-muted-foreground"
	/>
</a>
