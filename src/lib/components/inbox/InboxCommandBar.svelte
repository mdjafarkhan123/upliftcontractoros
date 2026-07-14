<script lang="ts">
	import * as Popover from '$lib/components/ui/popover';
	import * as Sheet from '$lib/components/ui/sheet';
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
		openCount = 0,
		awaitingCount = 0,
		unassignedCount = 0,
		failedCount = 0,
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
		openCount?: number;
		awaitingCount?: number;
		unassignedCount?: number;
		failedCount?: number;
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

	const searchTrimmed = $derived(search.trim());

	const activeFilterCount = $derived(
		(canViewAll && assignee !== 'all' ? 1 : 0) + (tag !== '' ? 1 : 0) + (unread ? 1 : 0)
	);

	let popoverOpen = $state(false);
	let sheetOpen = $state(false);

	function clearAll() {
		if (canViewAll) assignee = 'all';
		tag = '';
		unread = false;
	}
</script>

<div class="inbox-cmd" role="search" aria-label="Filter conversations">
	<!-- Single toolbar row: search + status segmented control + Filters overflow -->
	<div class="inbox-cmd__row">
		<div class="inbox-cmd__search">
			<i class="ri-search-line inbox-cmd__search-icon" aria-hidden="true"></i>
			<input
				type="search"
				inputmode="search"
				placeholder="Search contacts & messages"
				class="inbox-cmd__search-input"
				bind:value={search}
			/>
		</div>

		<!-- Status segmented control (primary, always visible) -->
		<div role="tablist" aria-label="Status filter" class="inbox-cmd__status">
			{#each STATUS_TABS as t (t.key)}
				{@const active = status === t.key}
				<button
					type="button"
					role="tab"
					aria-selected={active}
					onclick={() => (status = t.key)}
					class="inbox-cmd__status-btn"
					class:inbox-cmd__status-btn--active={active}
				>
					{t.label}
					{#if t.key === 'open' && openCount > 0}
						<span class="inbox-cmd__status-count">{openCount}</span>
					{/if}
				</button>
			{/each}
		</div>

		<!-- Desktop: Popover anchored to button -->
		<Popover.Root bind:open={popoverOpen}>
			<Popover.Trigger>
				{#snippet child({ props })}
					<button
						{...props}
						type="button"
						aria-label="More filters"
						class="inbox-cmd__filter-btn inbox-cmd__filter-btn--desktop"
						class:inbox-cmd__filter-btn--active={activeFilterCount > 0}
					>
						<i class="ri-equalizer-line" aria-hidden="true"></i>
						Filters
						{#if activeFilterCount > 0}
							<span class="inbox-cmd__count">{activeFilterCount}</span>
						{/if}
					</button>
				{/snippet}
			</Popover.Trigger>
			<Popover.Content align="end" sideOffset={8} class="popover__content inbox-cmd__popover">
				<div class="inbox-filters__head">
					<h3 class="inbox-filters__head-title">Filters</h3>
					{#if activeFilterCount > 0}
						<span class="inbox-filters__head-count">{activeFilterCount} active</span>
					{/if}
				</div>
				<InboxFilterPanel
					bind:status
					bind:assignee
					bind:tag
					bind:unread
					{orgTags}
					{canViewAll}
					{awaitingCount}
					{unassignedCount}
					{failedCount}
					showUnread={false}
					onClearAll={clearAll}
				/>
			</Popover.Content>
		</Popover.Root>

		<!-- Mobile: Sheet (bottom) anchored to button -->
		<Sheet.Root bind:open={sheetOpen}>
			<Sheet.Trigger>
				{#snippet child({ props })}
					<button
						{...props}
						type="button"
						aria-label="More filters"
						class="inbox-cmd__filter-btn inbox-cmd__filter-btn--mobile"
						class:inbox-cmd__filter-btn--active={activeFilterCount > 0}
					>
						<i class="ri-equalizer-line" aria-hidden="true"></i>
						Filters
						{#if activeFilterCount > 0}
							<span class="inbox-cmd__count">{activeFilterCount}</span>
						{/if}
					</button>
				{/snippet}
			</Sheet.Trigger>
			<Sheet.Content side="bottom" class="dialog-sheet inbox-cmd__sheet">
				<Sheet.Header class="inbox-cmd__sheet-head">
					<Sheet.Title>Filters</Sheet.Title>
				</Sheet.Header>
				<div class="inbox-cmd__sheet-body">
					<InboxFilterPanel
						bind:status
						bind:assignee
						bind:tag
						bind:unread
						{orgTags}
						{canViewAll}
						{awaitingCount}
						{unassignedCount}
						{failedCount}
						showUnread={true}
						onClearAll={clearAll}
					/>
				</div>
				<div class="inbox-cmd__sheet-foot">
					<button
						type="button"
						class="btn btn--primary btn--full"
						onclick={() => (sheetOpen = false)}
					>
						Apply
					</button>
				</div>
			</Sheet.Content>
		</Sheet.Root>
	</div>

	<!-- Inline "Search messages" toggle when query is long enough -->
	{#if searchTrimmed.length >= 3}
		<div class="inbox-cmd__msg-toggle-row">
			<button
				type="button"
				class="inbox-cmd__msg-toggle"
				onclick={() => (messageSearchOpen = !messageSearchOpen)}
			>
				<i class="ri-chat-search-line" aria-hidden="true"></i>
				{messageSearchOpen ? 'Hide' : 'Search messages'} for "{searchTrimmed}"
			</button>
			{#if messageSearchOpen && messageSearchLoading}
				<i class="ri-loader-4-line animate-spin inbox-cmd__msg-spin" aria-hidden="true"></i>
			{/if}
		</div>
		{#if messageSearchOpen && !messageSearchLoading && messageHits.length > 0}
			<ul class="inbox-cmd__msg-hits">
				{#each messageHits as h (h.id)}
					<li>
						<button
							type="button"
							onclick={() => onSelectMessageHit?.(h.id)}
							class="inbox-cmd__msg-hit"
						>
							<div class="inbox-cmd__msg-hit-top">
								<span class="inbox-cmd__msg-hit-name">{h.contact_name}</span>
								{#if h.unread_count > 0}
									<span class="convo-row__badge">{h.unread_count}</span>
								{/if}
							</div>
							{#if h.matched_body}
								<div class="inbox-cmd__msg-hit-preview">{h.matched_body}</div>
							{/if}
						</button>
					</li>
				{/each}
			</ul>
		{:else if messageSearchOpen && !messageSearchLoading}
			<div class="inbox-cmd__msg-empty">No matching messages.</div>
		{/if}
	{/if}
</div>
