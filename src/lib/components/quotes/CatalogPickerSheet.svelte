<script lang="ts">
	import * as Sheet from '$lib/components/ui/sheet';
	import { catalogStore } from '$lib/stores/catalog.svelte';
	import { formatCurrency } from '$lib/utils/format';
	import type { Attachment } from 'svelte/attachments';
	import type { CatalogItem } from '$lib/types/quotes';

	let {
		open = $bindable(false),
		onPick
	}: {
		open?: boolean;
		// Fired once per tap. Parent copies the item's fields onto a new quote line.
		onPick: (item: CatalogItem) => void;
	} = $props();

	let query = $state('');
	let activeCategory = $state<string | null>(null);

	// Load the catalog the first time the picker is opened, and reset the search each open.
	$effect(() => {
		if (open) {
			void catalogStore.load();
			query = '';
			activeCategory = null;
		}
	});

	const filtered = $derived.by(() => {
		const q = query.trim().toLowerCase();
		return catalogStore.items.filter((it) => {
			if (activeCategory && (it.category ?? '') !== activeCategory) return false;
			if (!q) return true;
			return (
				it.name.toLowerCase().includes(q) ||
				(it.description ?? '').toLowerCase().includes(q) ||
				(it.category ?? '').toLowerCase().includes(q)
			);
		});
	});

	const focusOnMount: Attachment<HTMLInputElement> = (node) => {
		// Defer so the sheet open animation doesn't fight the focus.
		setTimeout(() => node.focus(), 50);
	};

	function pick(item: CatalogItem) {
		onPick(item);
		open = false;
	}
</script>

<Sheet.Root bind:open>
	<Sheet.Content side="right" class="catalog-picker">
		<div class="catalog-picker__header">
			<Sheet.Title class="catalog-picker__title">
				<i class="ri-book-2-line" aria-hidden="true"></i>
				Add from price book
			</Sheet.Title>
		</div>

		<!-- Sticky search + category filters -->
		<div class="catalog-picker__tools">
			<div class="field__input-wrap">
				<i class="ri-search-line field__icon" aria-hidden="true"></i>
				<input
					{@attach focusOnMount}
					bind:value={query}
					placeholder="Search products & services…"
					class="field__input"
				/>
			</div>

			{#if catalogStore.categories.length > 0}
				<div class="catalog-picker__cats">
					<button
						type="button"
						class="catalog-picker__cat"
						class:catalog-picker__cat--active={activeCategory === null}
						onclick={() => (activeCategory = null)}
					>
						All
					</button>
					{#each catalogStore.categories as cat (cat)}
						<button
							type="button"
							class="catalog-picker__cat"
							class:catalog-picker__cat--active={activeCategory === cat}
							onclick={() => (activeCategory = cat)}
						>
							{cat}
						</button>
					{/each}
				</div>
			{/if}
		</div>

		<!-- Results -->
		<div class="catalog-picker__results">
			{#if catalogStore.status === 'loading' && catalogStore.items.length === 0}
				<p class="catalog-picker__loading">Loading price book…</p>
			{:else if catalogStore.items.length === 0}
				<div class="catalog-picker__empty">
					<span class="catalog-picker__empty-icon">
						<i class="ri-book-2-line" aria-hidden="true"></i>
					</span>
					<p class="catalog-picker__empty-title">Your price book is empty</p>
					<p class="catalog-picker__empty-text">
						Add a line item below, then tap the bookmark to save it here for next time.
					</p>
				</div>
			{:else if filtered.length === 0}
				<div class="catalog-picker__empty">
					<span class="catalog-picker__empty-icon">
						<i class="ri-search-line" aria-hidden="true"></i>
					</span>
					<p class="catalog-picker__empty-title">No matches</p>
					<p class="catalog-picker__empty-text">
						Nothing matches “{query.trim()}”. You can still add it as a custom line.
					</p>
				</div>
			{:else}
				<ul class="catalog-picker__list">
					{#each filtered as item (item.id)}
						<li>
							<button type="button" class="catalog-picker__item" onclick={() => pick(item)}>
								<span class="catalog-picker__item-body">
									<span class="catalog-picker__item-name">{item.name}</span>
									<span class="catalog-picker__item-meta">
										{#if item.category}{item.category}{/if}{#if item.category && item.unit}
											·
										{/if}{#if item.unit}per {item.unit}{/if}
									</span>
								</span>
								<span class="catalog-picker__item-price">
									{formatCurrency(Number(item.unit_price))}
								</span>
								<span class="catalog-picker__item-add">
									<i class="ri-add-line" aria-hidden="true"></i>
								</span>
							</button>
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	</Sheet.Content>
</Sheet.Root>
