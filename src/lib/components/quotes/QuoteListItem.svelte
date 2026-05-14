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
	class="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 transition-colors hover:bg-accent active:bg-accent"
>
	<div class="min-w-0 flex-1">
		<div class="flex items-center gap-2">
			<span class="text-sm font-semibold text-foreground">{quote.quote_number_display}</span>
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
	<ChevronRight class="h-4 w-4 shrink-0 text-muted-foreground" />
</a>
