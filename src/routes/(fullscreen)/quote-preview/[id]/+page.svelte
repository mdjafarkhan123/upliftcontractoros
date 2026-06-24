<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import QuoteDocumentView from '$lib/components/quotes/QuoteDocumentView.svelte';
	import { Check, Eye, MessageSquare, X } from '@lucide/svelte';
	import type { PublicQuoteView } from '$lib/types/quotes';
	import { resolveBrandTheme } from '$lib/utils/brandColor';

	let { data }: { data: { quote: PublicQuoteView | null } } = $props();

	const brand = $derived(resolveBrandTheme(data.quote?.org_primary_color ?? null));
	// Local selection state so the contractor can toggle add-ons and watch the total update,
	// exactly as the customer would. Nothing here is ever submitted.
	let selectedOptional = $state<Record<string, boolean>>({});

	function closePreview() {
		// Opened in a new tab from the quote editor — close it; fall back to history if the
		// browser blocks window.close() (e.g. tab wasn't script-opened).
		window.close();
		history.back();
	}
</script>

<svelte:head>
	<title
		>{data.quote ? `Preview — Quote ${data.quote.quote_number_display}` : 'Quote preview'}</title
	>
</svelte:head>

<!-- Preview banner — makes it unmistakable this is the contractor's view, not the live link. -->
<div
	class="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2.5 backdrop-blur"
>
	<div class="flex min-w-0 items-center gap-2 text-amber-800 dark:text-amber-300">
		<Eye class="h-4 w-4 shrink-0" />
		<p class="truncate text-sm font-medium">
			Client preview — this is exactly what your customer sees. Actions are disabled.
		</p>
	</div>
	<Button variant="ghost" size="sm" class="shrink-0" onclick={closePreview}>
		<X class="mr-1 h-4 w-4" />Close
	</Button>
</div>

<div
	class="min-h-screen bg-background px-4 py-8 md:py-12"
	style="--brand: {brand.accent}; --brand-fg: {brand.accentFg};"
>
	<div class="mx-auto max-w-xl">
		{#if !data.quote}
			<div class="rounded-2xl border border-border bg-card p-8 text-center">
				<h1 class="text-lg font-semibold">Preview unavailable</h1>
				<p class="mt-2 text-sm text-muted-foreground">
					This quote could not be loaded. It may have been deleted.
				</p>
			</div>
		{:else}
			<QuoteDocumentView quote={data.quote} bind:selectedOptional>
				{#snippet actions()}
					<!-- Inert mirror of the live action buttons so the layout matches the client view. -->
					<div class="space-y-2" aria-hidden="true">
						<Button
							disabled
							class="min-h-[52px] w-full bg-[color:var(--brand)] text-base text-[color:var(--brand-fg)] opacity-100"
						>
							<Check class="mr-1.5 h-5 w-5" />Accept quote
						</Button>
						<Button variant="outline" disabled class="min-h-[44px] w-full">
							<MessageSquare class="mr-2 h-4 w-4" />Request changes
						</Button>
						<Button variant="ghost" disabled class="min-h-[44px] w-full text-muted-foreground">
							Decline
						</Button>
					</div>
				{/snippet}
			</QuoteDocumentView>
		{/if}
	</div>
</div>
