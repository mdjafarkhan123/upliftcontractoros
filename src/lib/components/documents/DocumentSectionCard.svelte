<script lang="ts">
	// Shared titled section card for the document detail column (Details, Notes,
	// Terms, Line items). Two shapes: plain (title on top, body below) and flush
	// (bordered header row with an optional count + actions, edge-to-edge body —
	// used for the line-item editor). Body content is styled in the caller's scope.
	import type { Snippet } from 'svelte';

	let {
		title,
		count,
		flush = false,
		actions,
		subhead,
		children
	}: {
		title: string;
		count?: number;
		flush?: boolean;
		actions?: Snippet;
		subhead?: Snippet;
		children: Snippet;
	} = $props();
</script>

{#if flush}
	<div class="card doc-section doc-section--flush">
		<div class="doc-section__head">
			<div class="doc-section__title-wrap">
				<h2 class="doc-section__title">{title}</h2>
				{#if count != null && count > 0}
					<span class="badge badge--count">{count}</span>
				{/if}
			</div>
			{#if actions}<div class="doc-section__actions">{@render actions()}</div>{/if}
		</div>
		{#if subhead}{@render subhead()}{/if}
		<div class="doc-section__body">{@render children()}</div>
	</div>
{:else}
	<div class="card doc-section">
		{#if actions}
			<div class="doc-section__head doc-section__head--plain">
				<h2 class="doc-section__title">{title}</h2>
				<div class="doc-section__actions">{@render actions()}</div>
			</div>
		{:else}
			<h2 class="doc-section__title">{title}</h2>
		{/if}
		{@render children()}
	</div>
{/if}

<style lang="scss">
	@use '$lib/styles/tokens' as *;

	.doc-section__title {
		font-size: $fs-body;
		font-weight: $weight-semibold;
		color: var(--color-text-primary);
		margin: 0;
	}

	.doc-section--flush {
		overflow: hidden;
		padding: 0;
	}

	.doc-section__head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: $space-2;
		padding: $space-3 $space-4;
		border-bottom: 1px solid var(--color-border-subtle);
	}

	// Plain (non-flush) card header row: title + one pencil, no border/padding of its
	// own (the .card supplies padding); just space it off the body below.
	.doc-section__head--plain {
		padding: 0;
		border-bottom: none;
		margin-bottom: $space-3;
	}

	.doc-section__title-wrap {
		display: flex;
		align-items: center;
		gap: $space-2;
	}

	.doc-section__actions {
		display: flex;
		align-items: center;
		gap: $space-2;
	}

	.doc-section__body {
		padding: $space-4;
	}
</style>
