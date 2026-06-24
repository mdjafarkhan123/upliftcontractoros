<script lang="ts">
	import * as Sheet from '$lib/components/ui/sheet';
	import { catalogStore } from '$lib/stores/catalog.svelte';
	import { formatCurrency } from '$lib/utils/format';
	import { cn } from '$lib/utils/cn';
	import { Search, Plus, BookOpen, PackageSearch } from '@lucide/svelte';
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
	<Sheet.Content side="right" class="flex w-full flex-col gap-0 p-0 sm:max-w-lg">
		<Sheet.Header class="border-b border-border/60 px-4 py-3 text-left">
			<Sheet.Title class="flex items-center gap-2 text-base">
				<BookOpen class="h-4 w-4 text-primary" />
				Add from price book
			</Sheet.Title>
		</Sheet.Header>

		<!-- Sticky search + category filters -->
		<div class="shrink-0 space-y-3 border-b border-border/60 bg-card px-4 py-3">
			<div class="relative">
				<Search
					class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
				/>
				<input
					{@attach focusOnMount}
					bind:value={query}
					placeholder="Search products & services…"
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

		<!-- Results -->
		<div class="min-h-0 flex-1 overflow-y-auto p-3">
			{#if catalogStore.status === 'loading' && catalogStore.items.length === 0}
				<p class="px-1 py-6 text-center text-sm text-muted-foreground">Loading price book…</p>
			{:else if catalogStore.items.length === 0}
				<div class="flex flex-col items-center gap-2 px-4 py-10 text-center">
					<div
						class="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground"
					>
						<BookOpen class="h-6 w-6" />
					</div>
					<p class="text-sm font-medium text-foreground">Your price book is empty</p>
					<p class="text-xs text-muted-foreground">
						Add a line item below, then tap the bookmark to save it here for next time.
					</p>
				</div>
			{:else if filtered.length === 0}
				<div class="flex flex-col items-center gap-2 px-4 py-10 text-center">
					<div
						class="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground"
					>
						<PackageSearch class="h-6 w-6" />
					</div>
					<p class="text-sm font-medium text-foreground">No matches</p>
					<p class="text-xs text-muted-foreground">
						Nothing matches “{query.trim()}”. You can still add it as a custom line.
					</p>
				</div>
			{:else}
				<ul class="grid gap-2">
					{#each filtered as item (item.id)}
						<li>
							<button
								type="button"
								class="group flex w-full items-center gap-3 rounded-xl border border-border/60 bg-card p-3 text-left shadow-sm transition-all duration-150 ease-out hover:border-primary/30 hover:bg-card-raised hover:shadow-dropdown active:bg-muted/70"
								onclick={() => pick(item)}
							>
								<div class="min-w-0 flex-1">
									<p class="truncate text-sm font-semibold text-foreground">{item.name}</p>
									<p class="mt-0.5 truncate text-xs text-muted-foreground">
										{#if item.category}{item.category}{/if}{#if item.category && item.unit}
											· {/if}{#if item.unit}per {item.unit}{/if}
									</p>
								</div>
								<span class="shrink-0 font-mono text-sm font-semibold tabular-nums text-foreground">
									{formatCurrency(Number(item.unit_price))}
								</span>
								<span
									class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground"
								>
									<Plus class="h-4 w-4" />
								</span>
							</button>
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	</Sheet.Content>
</Sheet.Root>
