<script lang="ts">
	import { onMount } from 'svelte';
	import { BookOpen, Plus, Search, Pencil, Trash2, ImageIcon, MoreHorizontal } from '@lucide/svelte';
	import PageWrapper from '$lib/components/shared/PageWrapper.svelte';
	import SkeletonLoader from '$lib/components/shared/SkeletonLoader.svelte';
	import EmptyState from '$lib/components/shared/EmptyState.svelte';
	import CatalogItemSheet from '$lib/components/quotes/CatalogItemSheet.svelte';
	import { Button } from '$lib/components/ui/button';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { catalogStore } from '$lib/stores/catalog.svelte';
	import { getMemberContext } from '$lib/context/member';
	import { toast } from '$lib/stores/toast.svelte';
	import { formatCurrency } from '$lib/utils/format';
	import { cn } from '$lib/utils/cn';
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

<PageWrapper title="Price Book" subtitle="Reusable products, services, and pricing" back="/settings">
	{#snippet actions()}
		{#if canCreate}
			<Button class="gap-1.5" onclick={openCreate}>
				<Plus class="h-4 w-4" />New item
			</Button>
		{/if}
	{/snippet}

	<div class="flex flex-col gap-4">
		{#if catalogStore.status === 'loading' && catalogStore.items.length === 0}
			<SkeletonLoader lines={5} height="56px" label="Loading price book" />
		{:else if catalogStore.items.length === 0}
			<EmptyState
				icon={BookOpen}
				title="Your price book is empty"
				description="Add the products and services you sell most. They'll be one tap away when you build a quote — and you can save new ones straight from a quote too."
				actionLabel={canCreate ? 'Add your first item' : undefined}
				onAction={canCreate ? openCreate : undefined}
			/>
		{:else}
			<!-- Search + category filter -->
			<div class="flex flex-col gap-3">
				<div class="relative">
					<Search
						class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
					/>
					<input
						bind:value={query}
						placeholder="Search your price book…"
						class="h-10 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
					/>
				</div>
				{#if catalogStore.categories.length > 0}
					<div class="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5">
						<button
							type="button"
							class={cn(
								'shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
								activeCategory === null
									? 'border-primary/40 bg-primary/10 text-primary'
									: 'border-border/60 bg-background text-muted-foreground hover:bg-muted'
							)}
							onclick={() => (activeCategory = null)}
						>
							All
						</button>
						{#each catalogStore.categories as cat (cat)}
							<button
								type="button"
								class={cn(
									'shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
									activeCategory === cat
										? 'border-primary/40 bg-primary/10 text-primary'
										: 'border-border/60 bg-background text-muted-foreground hover:bg-muted'
								)}
								onclick={() => (activeCategory = cat)}
							>
								{cat}
							</button>
						{/each}
					</div>
				{/if}
			</div>

			{#if filtered.length === 0}
				<p class="px-1 py-8 text-center text-sm text-muted-foreground">
					Nothing matches your search.
				</p>
			{:else}
				<div class="overflow-hidden rounded-xl border border-border/70 bg-card shadow-card">
					<div class="overflow-x-auto">
						<table class="w-full min-w-[560px] text-sm">
							<thead>
								<tr class="border-b border-border/60 bg-muted/30">
									<th class="w-14 px-3 py-3"></th>
									<th
										class="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
									>Item</th>
									<th
										class="hidden px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground md:table-cell"
									>Category</th>
									<th
										class="hidden px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground lg:table-cell"
									>Unit</th>
									<th
										class="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
									>Price</th>
									<th
										class="hidden px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground xl:table-cell"
									>Cost</th>
									{#if canManage}
										<th class="w-12 px-2 py-3"></th>
									{/if}
								</tr>
							</thead>
							<tbody class="divide-y divide-border/30">
								{#each filtered as item (item.id)}
									<tr
										class="group cursor-pointer transition-colors hover:bg-muted/40"
										onclick={() => openEdit(item)}
									>
										<!-- Thumbnail -->
										<td class="w-14 px-3 py-3">
											{#if item.image_url}
												<img
													src={item.image_url}
													alt={item.name}
													class="h-10 w-10 rounded-lg border border-border/50 object-cover shadow-sm"
												/>
											{:else}
												<div
													class="flex h-10 w-10 items-center justify-center rounded-lg border border-border/40 bg-muted/50"
												>
													<ImageIcon class="h-4 w-4 text-muted-foreground/40" />
												</div>
											{/if}
										</td>

										<!-- Name + description -->
										<td class="px-4 py-3.5">
											<p class="truncate font-medium leading-snug text-foreground">{item.name}</p>
											{#if item.description}
												<p class="mt-0.5 max-w-xs truncate text-[11px] text-muted-foreground">
													{item.description}
												</p>
											{/if}
										</td>

										<!-- Category -->
										<td class="hidden px-4 py-3.5 md:table-cell">
											{#if item.category}
												<span
													class="inline-flex items-center rounded-full border border-border/60 bg-muted/50 px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
												>
													{item.category}
												</span>
											{:else}
												<span class="text-xs text-muted-foreground/30">—</span>
											{/if}
										</td>

										<!-- Unit -->
										<td class="hidden px-4 py-3.5 lg:table-cell">
											{#if item.unit}
												<span class="text-sm text-muted-foreground">per {item.unit}</span>
											{:else}
												<span class="text-xs text-muted-foreground/30">—</span>
											{/if}
										</td>

										<!-- Price -->
										<td class="px-4 py-3.5 text-right">
											<span class="font-mono text-sm font-semibold tabular-nums text-foreground">
												{formatCurrency(Number(item.unit_price))}
											</span>
										</td>

										<!-- Cost (private) -->
										<td class="hidden px-4 py-3.5 text-right xl:table-cell">
											{#if item.unit_cost}
												<span
													class="font-mono text-sm tabular-nums text-muted-foreground"
												>
													{formatCurrency(Number(item.unit_cost))}
												</span>
											{:else}
												<span class="text-xs text-muted-foreground/30">—</span>
											{/if}
										</td>

										<!-- Actions -->
										{#if canManage}
											<td
												class="w-12 px-2 py-3.5"
												onclick={(e) => e.stopPropagation()}
											>
												<DropdownMenu.Root>
													<DropdownMenu.Trigger
														class={cn(
															'inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-all hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
															'opacity-0 group-hover:opacity-100 focus-visible:opacity-100'
														)}
														aria-label="Actions for {item.name}"
													>
														<MoreHorizontal class="h-4 w-4" />
													</DropdownMenu.Trigger>
													<DropdownMenu.Content align="end">
														<DropdownMenu.Item onclick={() => openEdit(item)}>
															<Pencil class="h-4 w-4" />
															Edit item
														</DropdownMenu.Item>
														<DropdownMenu.Separator />
														<DropdownMenu.Item
															class="text-destructive focus:bg-destructive/10 focus:text-destructive"
															onclick={() => {
																deleteTarget = item;
																deleteOpen = true;
															}}
														>
															<Trash2 class="h-4 w-4" />
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
		{/if}
	</div>

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
