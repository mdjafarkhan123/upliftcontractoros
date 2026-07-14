<script lang="ts" module>
	export type ListStatus = 'idle' | 'loading' | 'revalidating' | 'ready' | 'error';
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import SkeletonLoader from './SkeletonLoader.svelte';
	import { Button } from '$lib/components/ui/button';

	let {
		// ── State (drives the skeleton → error → empty → content machine) ──
		status,
		itemCount,
		errorMsg = null,

		// ── Load-more footer ──
		nextCursor = null,
		loadingMore = false,
		onLoadMore,

		// ── Skeleton config ──
		skeletonLines = 6,
		skeletonHeight,
		skeletonLabel = 'Loading',

		// ── Slots ──
		/** KPI strip (or any header block) above the toolbar. */
		kpi,
		/** Filter tabs — the left, flex-1 region of the toolbar row. */
		tabs,
		/** Search bar — inline on desktop, full-width below the tabs on mobile. */
		search,
		/** Advanced filter control — inline on desktop, beside the tabs on mobile. */
		filter,
		/** Banner between toolbar and content (e.g. an active-filter notice). */
		banner,
		/** The loaded rows (table + cards). Rendered only when itemCount > 0. */
		content,
		/** Empty state — rendered when itemCount === 0 and not loading/errored. */
		empty
	}: {
		status: ListStatus;
		itemCount: number;
		errorMsg?: string | null;
		nextCursor?: string | null;
		loadingMore?: boolean;
		onLoadMore?: () => void;
		skeletonLines?: number;
		skeletonHeight?: string;
		skeletonLabel?: string;
		kpi?: Snippet;
		tabs?: Snippet;
		search?: Snippet;
		filter?: Snippet;
		banner?: Snippet;
		content: Snippet;
		empty: Snippet;
	} = $props();

	// Rule 16: never a stuck skeleton. Skeleton only while the FIRST page loads;
	// once any rows exist we keep showing them (stale-while-revalidate). Empty
	// state renders the moment we know the list is genuinely empty.
	const showSkeleton = $derived(status === 'loading' && itemCount === 0);
	const showError = $derived(status === 'error' && itemCount === 0);
	const showEmpty = $derived(itemCount === 0 && status !== 'loading' && status !== 'error');
</script>

<div class="list-shell">
	{#if kpi}
		{@render kpi()}
	{/if}

	{#if tabs || search || filter}
		<div class="list-shell__toolbar">
			<div class="list-shell__toolbar-row">
				{#if tabs}
					<div class="list-shell__tabs">{@render tabs()}</div>
				{/if}

				<!-- Desktop: search + filter inline, right of the tabs -->
				<div class="list-shell__controls">
					{#if search}
						<div class="list-shell__search">{@render search()}</div>
					{/if}
					{#if filter}
						{@render filter()}
					{/if}
				</div>

				<!-- Mobile: filter button sits beside the tabs -->
				{#if filter}
					<div class="list-shell__toolbar-filter">{@render filter()}</div>
				{/if}
			</div>
		</div>

		<!-- Mobile: search drops to a full-width row below the tab bar -->
		{#if search}
			<div class="list-shell__search-mobile">{@render search()}</div>
		{/if}
	{/if}

	{#if banner}
		{@render banner()}
	{/if}

	{#if showSkeleton}
		<SkeletonLoader lines={skeletonLines} height={skeletonHeight} label={skeletonLabel} />
	{:else if showError}
		<p class="list-shell__error">{errorMsg}</p>
	{:else if showEmpty}
		{@render empty()}
	{:else}
		{@render content()}

		{#if nextCursor}
			<div class="list-shell__more">
				<Button
					variant="secondary"
					loading={loadingMore}
					loadingLabel="Loading…"
					onclick={onLoadMore}
				>
					Load more
				</Button>
			</div>
		{/if}
	{/if}
</div>

<style lang="scss">
	@use '$lib/styles/tokens' as *;

	.list-shell {
		display: flex;
		flex-direction: column;
		gap: $space-3;

		&__error {
			font-size: $fs-body;
			color: var(--danger-text);
		}

		// ── Toolbar: [tabs flex-1] [search] [filter] on desktop ──
		&__toolbar {
			border-bottom: 1px solid var(--color-border);
		}
		&__toolbar-row {
			display: flex;
			align-items: flex-end;
			gap: $space-2;
		}
		&__tabs {
			min-width: 0;
			flex: 1;
			overflow-x: hidden;
		}

		&__controls {
			display: none;
			flex-shrink: 0;
			align-items: center;
			gap: $space-2;
			padding-bottom: $space-2;
			@media (min-width: $bp-tablet) {
				display: flex;
			}
		}
		&__search {
			width: 16rem;
		}

		&__toolbar-filter {
			display: flex;
			flex-shrink: 0;
			align-items: center;
			padding-bottom: $space-2;
			@media (min-width: $bp-tablet) {
				display: none;
			}
		}

		&__search-mobile {
			@media (min-width: $bp-tablet) {
				display: none;
			}
		}

		&__more {
			display: flex;
			justify-content: center;
			padding-top: $space-2;
		}
	}
</style>
