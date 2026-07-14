<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { onMount } from 'svelte';
	import PageWrapper from '$lib/components/shared/PageWrapper.svelte';
	import SkeletonLoader from '$lib/components/shared/SkeletonLoader.svelte';
	import EmptyState from '$lib/components/shared/EmptyState.svelte';
	import CatalogItemSheet from '$lib/components/quotes/CatalogItemSheet.svelte';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { catalogStore } from '$lib/stores/catalog.svelte';
	import { getMemberContext } from '$lib/context/member';
	import { toast } from '$lib/stores/toast.svelte';
	import { formatCurrency } from '$lib/utils/format';
	import type { CatalogItem } from '$lib/types/quotes';

	const member = getMemberContext();
	const m = $derived(member());
	const canManage = $derived(m.can_edit_quotes);
	const canCreate = $derived(m.can_create_quotes || m.can_edit_quotes);

	let query = $state('');
	let activeCategory = $state<string | null>(null);

	let sheetOpen = $state(false);
	let editTarget = $state<CatalogItem | null>(null);

	let ConfirmDialog = $state<
		typeof import('$lib/components/shared/ConfirmDialog.svelte').default | null
	>(null);
	let deleteOpen = $state(false);
	let deleteTarget = $state<CatalogItem | null>(null);
	let deleting = $state(false);
	$effect(() => {
		if (ConfirmDialog || !deleteOpen) return;
		void import('$lib/components/shared/ConfirmDialog.svelte').then((mod) => {
			ConfirmDialog = mod.default;
		});
	});

	onMount(() => void catalogStore.load());

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

	function openCreate() {
		editTarget = null;
		sheetOpen = true;
	}
	function openEdit(item: CatalogItem) {
		editTarget = item;
		sheetOpen = true;
	}

	async function archive(item: CatalogItem) {
		deleting = true;
		try {
			const res = await fetch(`/api/catalog-items/${item.id}`, { method: 'DELETE' });
			if (!res.ok) {
				toast.error('Could not archive item');
				return;
			}
			catalogStore.removeLocal(item.id);
			toast.success('Item archived');
		} finally {
			deleting = false;
			deleteTarget = null;
		}
	}
</script>

<svelte:head><title>Price Book — Settings</title></svelte:head>

<PageWrapper
	title="Price Book"
	subtitle="Reusable products, services, and pricing"
	back="/settings"
>
	{#snippet actions()}
		{#if canCreate}
			<Button onclick={openCreate}>
				<i class="ri-add-line" aria-hidden="true"></i>New item
			</Button>
		{/if}
	{/snippet}

	{#if catalogStore.status === 'loading' && catalogStore.items.length === 0}
		<SkeletonLoader lines={5} height="56px" label="Loading price book" />
	{:else if catalogStore.items.length === 0}
		<EmptyState
			iconClass="ri-book-open-line"
			title="Your price book is empty"
			description="Add the products and services you sell most. They'll be one tap away when you build a quote — and you can save new ones straight from a quote too."
			actionLabel={canCreate ? 'Add your first item' : undefined}
			onAction={canCreate ? openCreate : undefined}
		/>
	{:else}
		<div class="pricebook">
			<!-- Search + category filter -->
			<div class="pricebook__filters">
				<div class="field__input-wrap pricebook__search">
					<i class="ri-search-line field__icon" aria-hidden="true"></i>
					<input class="field__input" bind:value={query} placeholder="Search your price book…" />
				</div>
				{#if catalogStore.categories.length > 0}
					<div class="pricebook__cats">
						<button
							type="button"
							class="pricebook__cat"
							class:pricebook__cat--active={activeCategory === null}
							onclick={() => (activeCategory = null)}
						>
							All
						</button>
						{#each catalogStore.categories as cat (cat)}
							<button
								type="button"
								class="pricebook__cat"
								class:pricebook__cat--active={activeCategory === cat}
								onclick={() => (activeCategory = cat)}
							>
								{cat}
							</button>
						{/each}
					</div>
				{/if}
			</div>

			{#if filtered.length === 0}
				<p class="pricebook__none">Nothing matches your search.</p>
			{:else}
				<div class="pricebook__table-wrap">
					<div class="pricebook__scroll">
						<table class="pricebook__table">
							<thead>
								<tr>
									<th class="pricebook__th pricebook__th--thumb"></th>
									<th class="pricebook__th">Item</th>
									<th class="pricebook__th pricebook__th--category">Category</th>
									<th class="pricebook__th pricebook__th--unit">Unit</th>
									<th class="pricebook__th pricebook__th--num">Price</th>
									<th class="pricebook__th pricebook__th--num pricebook__th--cost">Cost</th>
									{#if canManage}
										<th class="pricebook__th pricebook__th--actions"></th>
									{/if}
								</tr>
							</thead>
							<tbody>
								{#each filtered as item (item.id)}
									<tr class="pricebook__row" onclick={() => openEdit(item)}>
										<!-- Thumbnail -->
										<td class="pricebook__cell pricebook__cell--thumb">
											{#if item.image_url}
												<img class="pricebook__thumb" src={item.image_url} alt={item.name} />
											{:else}
												<div class="pricebook__thumb pricebook__thumb--empty">
													<i class="ri-image-line" aria-hidden="true"></i>
												</div>
											{/if}
										</td>

										<!-- Name + description -->
										<td class="pricebook__cell">
											<p class="pricebook__name">{item.name}</p>
											{#if item.description}
												<p class="pricebook__item-desc">{item.description}</p>
											{/if}
										</td>

										<!-- Category -->
										<td class="pricebook__cell pricebook__cell--category">
											{#if item.category}
												<span class="pricebook__cat-tag">{item.category}</span>
											{:else}
												<span class="pricebook__muted">—</span>
											{/if}
										</td>

										<!-- Unit -->
										<td class="pricebook__cell pricebook__cell--unit">
											{#if item.unit}
												<span class="pricebook__unit">per {item.unit}</span>
											{:else}
												<span class="pricebook__muted">—</span>
											{/if}
										</td>

										<!-- Price -->
										<td class="pricebook__cell pricebook__cell--num">
											<span class="pricebook__price">{formatCurrency(Number(item.unit_price))}</span
											>
										</td>

										<!-- Cost (private) -->
										<td class="pricebook__cell pricebook__cell--num pricebook__cell--cost">
											{#if item.unit_cost}
												<span class="pricebook__cost">{formatCurrency(Number(item.unit_cost))}</span
												>
											{:else}
												<span class="pricebook__muted">—</span>
											{/if}
										</td>

										<!-- Actions -->
										{#if canManage}
											<td
												class="pricebook__cell pricebook__cell--actions"
												onclick={(e) => e.stopPropagation()}
											>
												<DropdownMenu.Root>
													<DropdownMenu.Trigger
														class="pricebook__menu-btn"
														aria-label="Actions for {item.name}"
													>
														<i class="ri-more-2-fill" aria-hidden="true"></i>
													</DropdownMenu.Trigger>
													<DropdownMenu.Content align="end">
														<DropdownMenu.Item onclick={() => openEdit(item)}>
															<i class="ri-pencil-line" aria-hidden="true"></i>
															Edit item
														</DropdownMenu.Item>
														<DropdownMenu.Separator />
														<DropdownMenu.Item
															variant="destructive"
															onclick={() => {
																deleteTarget = item;
																deleteOpen = true;
															}}
														>
															<i class="ri-delete-bin-line" aria-hidden="true"></i>
															Archive item
														</DropdownMenu.Item>
													</DropdownMenu.Content>
												</DropdownMenu.Root>
											</td>
										{/if}
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				</div>
			{/if}
		</div>
	{/if}

	<CatalogItemSheet bind:open={sheetOpen} item={editTarget} />

	{#if ConfirmDialog}
		<ConfirmDialog
			bind:open={deleteOpen}
			title="Archive item"
			description={deleteTarget
				? `Archive "${deleteTarget.name}"? It will be removed from the price book picker. Quotes that already use it are unaffected.`
				: ''}
			confirmLabel="Archive"
			variant="destructive"
			loading={deleting}
			onConfirm={() => {
				if (deleteTarget) void archive(deleteTarget);
			}}
		/>
	{/if}
</PageWrapper>
