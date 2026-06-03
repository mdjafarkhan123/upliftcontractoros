<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import QuoteStatusBadge from '$lib/components/quotes/QuoteStatusBadge.svelte';
	import { formatCurrency } from '$lib/utils/format';
	import { FileText, Plus, ChevronDown } from '@lucide/svelte';
	import type { OpportunityQuote } from '$lib/types/pipeline';

	type Props = {
		quotes: OpportunityQuote[];
		contactId: string;
		opportunityId: string;
		canCreate: boolean;
	};

	let { quotes, contactId, opportunityId, canCreate }: Props = $props();

	let expanded = $state(false);

	const VISIBLE = 3;
	const visible = $derived(expanded ? quotes : quotes.slice(0, VISIBLE));
	const hiddenCount = $derived(Math.max(0, quotes.length - VISIBLE));

	const newQuoteHref = $derived(
		`/quotes/new?opportunity_id=${opportunityId}&contact_id=${contactId}`
	);
</script>

<section class="rounded-xl border border-border bg-card">
	<header class="flex items-center justify-between gap-3 border-b border-border/60 px-3 py-2">
		<div class="flex items-center gap-2">
			<FileText class="h-4 w-4 text-muted-foreground" aria-hidden="true" />
			<h3 class="text-sm font-semibold">Quotes</h3>
			{#if quotes.length > 0}
				<span class="text-xs text-muted-foreground">({quotes.length})</span>
			{/if}
		</div>
		{#if canCreate}
			<Button size="sm" href={newQuoteHref}>
				<Plus class="h-4 w-4" />New quote
			</Button>
		{/if}
	</header>

	{#if quotes.length === 0}
		<div class="px-3 py-4 text-center">
			<p class="text-xs text-muted-foreground">
				No quotes yet — create one to move this opportunity forward.
			</p>
		</div>
	{:else}
		<ul class="divide-y divide-border/60">
			{#each visible as q (q.id)}
				<li>
					<a
						href={`/quotes/${q.id}`}
						class="flex items-center justify-between gap-3 px-3 py-2.5 transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none"
					>
						<div class="min-w-0 flex-1">
							<div class="flex items-center gap-2">
								<span class="font-mono text-xs font-semibold tabular-nums text-foreground">
									{q.quote_number_display}
								</span>
								<QuoteStatusBadge status={q.status} />
							</div>
							<p class="mt-0.5 truncate text-xs text-muted-foreground">{q.title}</p>
						</div>
						<div class="shrink-0 text-sm font-semibold tabular-nums text-foreground">
							{formatCurrency(q.total)}
						</div>
					</a>
				</li>
			{/each}
		</ul>

		{#if hiddenCount > 0 && !expanded}
			<button
				type="button"
				onclick={() => (expanded = true)}
				class="flex w-full items-center justify-center gap-1 border-t border-border/60 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
			>
				<ChevronDown class="h-3.5 w-3.5" /> Show {hiddenCount} more
			</button>
		{/if}
	{/if}
</section>
