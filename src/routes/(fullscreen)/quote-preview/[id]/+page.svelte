<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import QuoteDocumentView from '$lib/components/quotes/QuoteDocumentView.svelte';
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
<div class="qpv__banner">
	<div class="qpv__banner-info">
		<i class="ri-eye-line qpv__banner-icon" aria-hidden="true"></i>
		<p class="qpv__banner-text">
			Client preview — this is exactly what your customer sees. Actions are disabled.
		</p>
	</div>
	<Button variant="ghost" size="sm" onclick={closePreview}>
		<i class="ri-close-line" aria-hidden="true"></i>Close
	</Button>
</div>

<div class="qpv__page" style="--brand: {brand.accent}; --brand-fg: {brand.accentFg};">
	<div class="qpv__container">
		{#if !data.quote}
			<div class="qpv__empty">
				<h1 class="qpv__empty-title">Preview unavailable</h1>
				<p class="qpv__empty-text">This quote could not be loaded. It may have been deleted.</p>
			</div>
		{:else}
			<QuoteDocumentView quote={data.quote} bind:selectedOptional>
				{#snippet actions()}
					<!-- Inert mirror of the live action buttons so the layout matches the client view. -->
					<div class="qpv__actions" aria-hidden="true">
						<Button
							disabled
							style="width:100%;min-height:52px;font-size:1.6rem;background:var(--brand);color:var(--brand-fg);opacity:1;"
						>
							<i class="ri-check-line" aria-hidden="true"></i>Accept quote
						</Button>
						<Button variant="outline" disabled style="width:100%;min-height:44px;">
							<i class="ri-message-2-line" aria-hidden="true"></i>Request changes
						</Button>
						<Button
							variant="ghost"
							disabled
							style="width:100%;min-height:44px;color:var(--color-text-muted);"
						>
							Decline
						</Button>
					</div>
				{/snippet}
			</QuoteDocumentView>
		{/if}
	</div>
</div>

<style lang="scss">
	@use '$lib/styles/tokens' as *;

	.qpv {
		&__banner {
			position: sticky;
			top: 0;
			z-index: 20;
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: $space-3;
			padding: 10px $space-4;
			border-bottom: 1px solid var(--warning-solid);
			background: var(--warning-bg);
			backdrop-filter: blur(8px);
		}

		&__banner-info {
			display: flex;
			min-width: 0;
			align-items: center;
			gap: $space-2;
			color: var(--warning-text);
		}

		&__banner-icon {
			flex-shrink: 0;
			font-size: 16px;
		}

		&__banner-text {
			margin: 0;
			font-size: $fs-body;
			font-weight: $weight-medium;
			white-space: nowrap;
			overflow: hidden;
			text-overflow: ellipsis;
		}

		&__page {
			min-height: 100vh;
			padding: $space-8 $space-4;
			background: var(--color-bg-app);

			@media (min-width: 768px) {
				padding-top: 48px;
				padding-bottom: 48px;
			}
		}

		&__container {
			margin: 0 auto;
			max-width: 1366px;
		}

		&__empty {
			padding: $space-8;
			text-align: center;
			border: 1px solid var(--color-border);
			border-radius: $radius-2xl;
			background: var(--color-bg-surface);
		}

		&__empty-title {
			margin: 0;
			font-size: $fs-lg;
			font-weight: $weight-semibold;
			color: var(--color-text-primary);
		}

		&__empty-text {
			margin: $space-2 0 0;
			font-size: $fs-body;
			color: var(--color-text-muted);
		}

		&__actions {
			display: flex;
			flex-direction: column;
			gap: $space-2;
		}
	}
</style>
