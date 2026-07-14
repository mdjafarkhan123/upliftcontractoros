<script lang="ts">
	// Shared two-rail detail layout for revenue documents (quotes + invoices).
	// Wide left column for the document + build surface, narrow sticky right rail
	// for the money summary. Jobber/HCP/QuickBooks pattern — one shell, both pages.
	import type { Snippet } from 'svelte';

	let { main, sidebar }: { main: Snippet; sidebar: Snippet } = $props();
</script>

<div class="doc-detail">
	<div class="doc-detail__main">{@render main()}</div>
	<div class="doc-detail__sidebar">{@render sidebar()}</div>
</div>

<style lang="scss">
	@use '$lib/styles/tokens' as *;

	.doc-detail {
		display: grid;
		gap: $space-6;
		grid-template-columns: 1fr;

		@media (min-width: $bp-tablet) {
			grid-template-columns: 1fr 360px;
			align-items: start;
		}

		&__main {
			display: flex;
			flex-direction: column;
			gap: $space-4;
			min-width: 0;
		}

		&__sidebar {
			display: flex;
			flex-direction: column;
			gap: $space-4;

			@media (min-width: $bp-tablet) {
				position: sticky;
				top: 96px;
			}
		}
	}
</style>
