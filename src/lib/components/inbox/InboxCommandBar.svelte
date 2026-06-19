<script lang="ts">
	import { Search, SlidersHorizontal, MessageSquare, Loader2 } from '@lucide/svelte';
	import { Input } from '$lib/components/ui/input';
	import { Button } from '$lib/components/ui/button';
	import * as Popover from '$lib/components/ui/popover';
	import * as Sheet from '$lib/components/ui/sheet';
	import { cn } from '$lib/utils/cn';
	import InboxFilterPanel from './InboxFilterPanel.svelte';
	import type { StatusFilter, AssigneeFilter } from '$lib/stores/inbox.svelte';

	type MessageSearchHit = {
		id: string;
		contact_name: string;
		matched_body: string | null;
		unread_count: number;
	};

	let {
		status = $bindable<StatusFilter>('open'),
		assignee = $bindable<AssigneeFilter>('all'),
		unread = $bindable<boolean>(false),
		tag = $bindable<string>(''),
		search = $bindable<string>(''),
		orgTags = [] as string[],
		canViewAll = true,
		messageHits = [] as MessageSearchHit[],
		messageSearchOpen = $bindable<boolean>(false),
		messageSearchLoading = false,
		onSelectMessageHit
	}: {
		status?: StatusFilter;
		assignee?: AssigneeFilter;
		unread?: boolean;
		tag?: string;
		search?: string;
		orgTags?: string[];
		canViewAll?: boolean;
		messageHits?: MessageSearchHit[];
		messageSearchOpen?: boolean;
		messageSearchLoading?: boolean;
		onSelectMessageHit?: (id: string) => void;
	} = $props();

	const STATUS_TABS: Array<{ key: StatusFilter; label: string }> = [
		{ key: 'open', label: 'Open' },
		{ key: 'snoozed', label: 'Snoozed' },
		{ key: 'closed', label: 'Closed' },
		{ key: 'all', label: 'All' }
	];

	const ASSIGNEE_TABS: Array<{ key: AssigneeFilter; label: string }> = $derived(
		canViewAll
			? [
					{ key: 'all', label: 'All' },
					{ key: 'me', label: 'Mine' },
					{ key: 'unassigned', label: 'Unassigned' }
				]
			: [
					{ key: 'all', label: 'All' },
					{ key: 'me', label: 'Mine' }
				]
	);

	const searchTrimmed = $derived(search.trim());

	const activeFilterCount = $derived(
		(canViewAll && assignee !== 'all' ? 1 : 0) + (tag !== '' ? 1 : 0) + (unread ? 1 : 0)
	);

	let popoverOpen = $state(false);
	let sheetOpen = $state(false);
	const isAnyOverlayOpen = $derived(popoverOpen || sheetOpen);

	function clearAll() {
		if (canViewAll) assignee = 'all';
		tag = '';
		unread = false;
	}
</script>

<!--
  Command bar lives in 2 rows on both viewports:
  Row 1 — Search (flex-1) + Filters overflow (lg+: popover, <lg: bottom sheet)
  Row 2 — Status pill group (primary filter, always visible, horizontal scroll on overflow)
  Active filter chips + message-search hits render BELOW the bar when applicable.
-->
<div class="bg-background" role="search" aria-label="Filter conversations">
	<!-- Row 1: Search + Filters overflow -->
	<div class="flex items-center gap-2 border-b border-border/40 px-3 py-2 lg:px-4 lg:py-2.5">
		<div class="relative min-w-0 flex-1">
			<Search
				class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/70"
			/>
			<Input
				type="search"
				inputmode="search"
				placeholder="Search contacts & messages"
				class="h-9 border-border/50 pl-9 shadow-none"
				bind:value={search}
			/>
		</div>

		<!-- Desktop: Popover anchored to button. Hidden on mobile. -->
		<Popover.Root bind:open={popoverOpen}>
			<Popover.Trigger>
				{#snippet child({ props })}
					<button
						{...props}
						type="button"
						aria-label="More filters"
						class={cn(
							'hidden h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors duration-150 lg:inline-flex',
							'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
							activeFilterCount > 0
								? 'border-primary/40 bg-primary/10 text-primary'
								: 'border-border/60 bg-background text-muted-foreground hover:bg-muted hover:text-foreground'
						)}
					>
						<SlidersHorizontal class="h-3.5 w-3.5" />
						Filters
						{#if activeFilterCount > 0}
							<span
								class="inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground"
							>
								{activeFilterCount}
							</span>
						{/if}
					</button>
				{/snippet}
			</Popover.Trigger>
			<Popover.Content align="end" sideOffset={8} class="w-[320px] p-4">
				<div class="mb-3 flex items-center justify-between">
					<h3 class="text-sm font-semibold text-foreground">Filters</h3>
					{#if activeFilterCount > 0}
						<span
							class="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-primary/10 px-1.5 text-[10px] font-semibold text-primary"
						>
							{activeFilterCount} active
						</span>
					{/if}
				</div>
				<InboxFilterPanel
					bind:assignee
					bind:tag
					bind:unread
					{orgTags}
					{canViewAll}
					showUnread={false}
					onClearAll={clearAll}
				/>
			</Popover.Content>
		</Popover.Root>

		<!-- Mobile: Sheet (bottom) anchored to button. Hidden on desktop. -->
		<Sheet.Root bind:open={sheetOpen}>
			<Sheet.Trigger>
				{#snippet child({ props })}
					<button
						{...props}
						type="button"
						aria-label="More filters"
						class={cn(
							'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors duration-150 lg:hidden',
							'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
							activeFilterCount > 0
								? 'border-primary/40 bg-primary/10 text-primary'
								: 'border-border/60 bg-background text-muted-foreground hover:bg-muted hover:text-foreground'
						)}
					>
						<SlidersHorizontal class="h-3.5 w-3.5" />
						Filters
						{#if activeFilterCount > 0}
							<span
								class="inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground"
							>
								{activeFilterCount}
							</span>
						{/if}
					</button>
				{/snippet}
			</Sheet.Trigger>
			<Sheet.Content side="bottom" class="rounded-t-2xl">
				<Sheet.Header class="px-0">
					<Sheet.Title class="text-base font-semibold">Filters</Sheet.Title>
				</Sheet.Header>
				<div class="px-0 pb-2">
					<InboxFilterPanel
						bind:assignee
						bind:tag
						bind:unread
						{orgTags}
						{canViewAll}
						showUnread={true}
						onClearAll={clearAll}
					/>
				</div>
				<div class="border-t border-border/60 pt-3">
					<Button class="w-full" onclick={() => (sheetOpen = false)}>Apply</Button>
				</div>
			</Sheet.Content>
		</Sheet.Root>
	</div>

	<!-- Row 2: Status pills (primary, always visible) -->
	<div
		role="tablist"
		aria-label="Status filter"
		class="flex items-center gap-1 overflow-x-auto border-b border-border/40 bg-muted/30 px-3 py-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:px-4"
	>
		{#each STATUS_TABS as t (t.key)}
			{@const active = status === t.key}
			<button
				type="button"
				role="tab"
				aria-selected={active}
				onclick={() => (status = t.key)}
				class={cn(
					'inline-flex h-7 shrink-0 items-center rounded-full px-3 text-xs font-medium transition-all duration-150',
					'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
					active
						? 'bg-background text-foreground shadow-sm'
						: 'text-muted-foreground hover:text-foreground'
				)}
			>
				{t.label}
			</button>
		{/each}
	</div>

	<!-- Optional: inline "Search messages" toggle (compact) when query is long enough -->
	{#if searchTrimmed.length >= 3}
		<div class="flex items-center justify-between border-b border-border/40 px-3 py-1.5 lg:px-4">
			<button
				type="button"
				class="inline-flex items-center gap-1.5 text-[11px] font-medium text-primary transition-colors hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				onclick={() => (messageSearchOpen = !messageSearchOpen)}
			>
				<MessageSquare class="h-3 w-3" />
				{messageSearchOpen ? 'Hide' : 'Search messages'} for "{searchTrimmed}"
			</button>
			{#if messageSearchOpen && messageSearchLoading}
				<Loader2 class="h-3 w-3 animate-spin text-muted-foreground" />
			{/if}
		</div>
		{#if messageSearchOpen && !messageSearchLoading && messageHits.length > 0}
			<ul class="grid gap-1 border-b border-border/40 bg-muted/20 px-3 py-2 lg:px-4">
				{#each messageHits as h (h.id)}
					<li>
						<button
							type="button"
							onclick={() => onSelectMessageHit?.(h.id)}
							class="block w-full rounded-md border border-border/40 bg-background px-2.5 py-2 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						>
							<div class="flex items-center justify-between gap-2">
								<span class="truncate text-xs font-semibold text-foreground">
									{h.contact_name}
								</span>
								{#if h.unread_count > 0}
									<span
										class="inline-flex h-4 min-w-[16px] shrink-0 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground"
									>
										{h.unread_count}
									</span>
								{/if}
							</div>
							{#if h.matched_body}
								<div class="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground">
									{h.matched_body}
								</div>
							{/if}
						</button>
					</li>
				{/each}
			</ul>
		{:else if messageSearchOpen && !messageSearchLoading}
			<div class="border-b border-border/40 px-3 py-1.5 text-[11px] text-muted-foreground lg:px-4">
				No matching messages.
			</div>
		{/if}
	{/if}
</div>
