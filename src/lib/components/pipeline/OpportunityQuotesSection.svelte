<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import QuoteStatusBadge from '$lib/components/quotes/QuoteStatusBadge.svelte';
	import { formatCurrency } from '$lib/utils/format';
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

<section class="opp-section">
	<header class="opp-section__header">
		<div class="opp-section__header-left">
			<i class="ri-file-text-line opp-section__title-icon" aria-hidden="true"></i>
			<h3 class="opp-section__title">Quotes</h3>
			{#if quotes.length > 0}
				<span class="opp-section__count">{quotes.length}</span>
			{/if}
		</div>
		{#if canCreate}
			<Button size="sm" href={newQuoteHref} style="gap:4px;">
				<i class="ri-add-line" aria-hidden="true"></i>New quote
			</Button>
		{/if}
	</header>

	{#if quotes.length === 0}
		<div class="opp-section__empty">
			<p>No quotes yet — create one to move this opportunity forward.</p>
		</div>
	{:else}
		<ul class="opp-section__list">
			{#each visible as q (q.id)}
				<li>
					<a href="/quotes/{q.id}" class="opp-section__quote-link">
						<div class="opp-section__quote-left">
							<div class="opp-section__quote-meta">
								<span class="opp-section__quote-num">{q.quote_number_display}</span>
								<QuoteStatusBadge status={q.status} />
							</div>
							<p class="opp-section__quote-title">{q.title}</p>
						</div>
						<div class="opp-section__quote-total">{formatCurrency(q.total)}</div>
					</a>
				</li>
			{/each}
		</ul>

		{#if hiddenCount > 0 && !expanded}
			<button type="button" onclick={() => (expanded = true)} class="opp-section__show-more">
				<i class="ri-arrow-down-s-line" aria-hidden="true"></i> Show {hiddenCount} more
			</button>
		{/if}
	{/if}
</section>
