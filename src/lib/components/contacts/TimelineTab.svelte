<script lang="ts">
	import { goto } from '$app/navigation';
	import EmptyState from '$lib/components/shared/EmptyState.svelte';
	import SkeletonLoader from '$lib/components/shared/SkeletonLoader.svelte';
	import ConfirmDialog from '$lib/components/shared/ConfirmDialog.svelte';
	import { Button } from '$lib/components/ui/button';
	import { getMemberContext } from '$lib/context/member';
	import { SvelteURLSearchParams } from 'svelte/reactivity';

	type Tone = 'neutral' | 'positive' | 'attention' | 'negative';

	type TimelineEntry = {
		type: string;
		id: string;
		created_at: string;
		icon_key: string;
		tone: Tone;
		description: string;
		metadata?: Record<string, unknown> | null;
		link?: string | null;
	};

	type FilterCategory = {
		key: string;
		label: string;
		icon: string;
	};

	const FILTER_CATEGORIES: FilterCategory[] = [
		{ key: 'messages', label: 'Messages', icon: 'ri-chat-1-line' },
		{ key: 'quotes', label: 'Quotes', icon: 'ri-file-text-line' },
		{ key: 'invoices', label: 'Invoices', icon: 'ri-receipt-line' },
		{ key: 'appointments', label: 'Appts', icon: 'ri-calendar-line' },
		{ key: 'jobs', label: 'Jobs', icon: 'ri-briefcase-line' },
		{ key: 'reviews', label: 'Reviews', icon: 'ri-star-line' },
		{ key: 'notes', label: 'Notes', icon: 'ri-sticky-note-line' },
		{ key: 'automations', label: 'Auto', icon: 'ri-flashlight-line' }
	];

	let { contactId, compact = false }: { contactId: string; compact?: boolean } = $props();

	const member = getMemberContext();
	const canEdit = $derived(member().can_edit_contacts);

	let items = $state<TimelineEntry[]>([]);
	let nextCursor = $state<string | null>(null);
	let loading = $state(true);
	let loadingMore = $state(false);
	let errorMsg = $state<string | null>(null);

	// Compact mode: show only the latest few entries with a "Show more" that
	// expands into the full timeline (search, filters, and pagination).
	const COMPACT_LIMIT = 3;
	let expanded = $state(false);
	const collapsed = $derived(compact && !expanded);
	const visibleItems = $derived(collapsed ? items.slice(0, COMPACT_LIMIT) : items);

	let searchInput = $state('');
	let appliedSearch = $state('');
	let searchTimer: ReturnType<typeof setTimeout> | null = null;

	let activeFilters = $state<Set<string>>(new Set());

	let pendingDeleteEntry = $state<TimelineEntry | null>(null);
	let confirmDeleteOpen = $state(false);
	let deleting = $state(false);

	function toggleFilter(key: string) {
		const next = new Set(activeFilters);
		if (next.has(key)) next.delete(key);
		else next.add(key);
		activeFilters = next;
	}

	// Remix icon class map (replaces Lucide component map)
	const ICONS: Record<string, string> = {
		'message-in': 'ri-chat-1-line',
		'message-out': 'ri-message-2-line',
		'quote-sent': 'ri-file-text-line',
		'quote-viewed': 'ri-eye-line',
		'quote-accepted': 'ri-checkbox-circle-line',
		'quote-declined': 'ri-close-circle-line',
		'invoice-sent': 'ri-receipt-line',
		'invoice-paid': 'ri-checkbox-circle-line',
		payment: 'ri-money-dollar-circle-line',
		appointment: 'ri-calendar-line',
		'appointment-completed': 'ri-calendar-check-line',
		'appointment-cancelled': 'ri-calendar-close-line',
		'job-created': 'ri-briefcase-line',
		'job-completed': 'ri-briefcase-4-line',
		'job-cancelled': 'ri-close-circle-line',
		'review-request': 'ri-send-plane-line',
		review: 'ri-star-line',
		feedback: 'ri-alert-line',
		note: 'ri-sticky-note-line',
		'automation-missed-call': 'ri-phone-missed-line',
		'automation-quote-followup': 'ri-flashlight-line',
		'automation-invoice-reminder': 'ri-flashlight-line'
	};

	async function load(cursor: string | null, term: string, filters: Set<string>) {
		const params = new SvelteURLSearchParams();
		if (cursor) params.set('cursor', cursor);
		if (term) params.set('q', term);
		if (filters.size > 0) params.set('types', [...filters].join(','));
		const res = await fetch(`/api/contacts/${contactId}/timeline?${params.toString()}`);
		if (!res.ok) {
			errorMsg = 'Failed to load timeline.';
			return;
		}
		const body = (await res.json()) as { items: TimelineEntry[]; next_cursor: string | null };
		items = cursor ? [...items, ...body.items] : body.items;
		nextCursor = body.next_cursor;
	}

	$effect(() => {
		const term = appliedSearch;
		const filters = activeFilters;
		void contactId;
		loading = true;
		errorMsg = null;
		load(null, term, filters).finally(() => (loading = false));
	});

	function onSearchInput(e: Event) {
		searchInput = (e.target as HTMLInputElement).value;
		if (searchTimer) clearTimeout(searchTimer);
		searchTimer = setTimeout(() => (appliedSearch = searchInput.trim()), 250);
	}

	function clearSearch() {
		if (searchTimer) clearTimeout(searchTimer);
		searchInput = '';
		appliedSearch = '';
	}

	async function loadMore() {
		if (!nextCursor || loadingMore) return;
		loadingMore = true;
		await load(nextCursor, appliedSearch, activeFilters);
		loadingMore = false;
	}

	function formatRelative(iso: string): string {
		const then = new Date(iso).getTime();
		const now = Date.now();
		const diffMs = now - then;
		const sec = Math.round(diffMs / 1000);
		if (sec < 60) return 'Just now';
		const min = Math.round(sec / 60);
		if (min < 60) return `${min}m ago`;
		const hr = Math.round(min / 60);
		if (hr < 24) return `${hr}h ago`;
		const day = Math.round(hr / 24);
		if (day === 1) return 'Yesterday';
		if (day < 7) return `${day} days ago`;
		if (day < 30) return `${Math.round(day / 7)}w ago`;
		return new Date(iso).toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		});
	}

	function getIcon(key: string): string {
		return ICONS[key] ?? 'ri-time-line';
	}

	function isNewDay(curr: string, prev: string | null): boolean {
		if (!prev) return true;
		return new Date(curr).toDateString() !== new Date(prev).toDateString();
	}

	function dayLabel(iso: string): string {
		const d = new Date(iso);
		const now = new Date();
		const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
		const diffDays = Math.round((startOf(now) - startOf(d)) / 86_400_000);
		if (diffDays === 0) return 'Today';
		if (diffDays === 1) return 'Yesterday';
		if (diffDays > 1 && diffDays < 7) return d.toLocaleDateString('en-US', { weekday: 'long' });
		return d.toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			...(d.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' })
		});
	}

	function onEntryClick(entry: TimelineEntry) {
		if (entry.link) goto(entry.link);
	}

	function askDelete(entry: TimelineEntry, e: MouseEvent) {
		e.stopPropagation();
		pendingDeleteEntry = entry;
		confirmDeleteOpen = true;
	}

	async function confirmDelete() {
		const entry = pendingDeleteEntry;
		if (!entry) return;
		const noteId = (entry.metadata?.note_id as string | undefined) ?? null;
		if (!noteId) {
			pendingDeleteEntry = null;
			return;
		}
		deleting = true;
		try {
			const res = await fetch(`/api/contacts/${contactId}/notes/${noteId}`, { method: 'DELETE' });
			if (res.ok) {
				items = items.filter((i) => i.id !== entry.id);
			}
		} finally {
			deleting = false;
			pendingDeleteEntry = null;
		}
	}
</script>

<div class="timeline">
	{#if !collapsed && (items.length > 0 || appliedSearch || activeFilters.size > 0)}
		<!-- Search -->
		<div class="timeline__search-wrap">
			<i class="ri-search-line timeline__search-icon" aria-hidden="true"></i>
			<input
				type="search"
				inputmode="search"
				placeholder="Search timeline — quote, invoice, payment…"
				class="timeline__search-input"
				value={searchInput}
				oninput={onSearchInput}
			/>
			{#if searchInput}
				<button
					type="button"
					onclick={clearSearch}
					aria-label="Clear search"
					class="timeline__search-clear"
				>
					<i class="ri-close-line" aria-hidden="true"></i>
				</button>
			{/if}
		</div>

		<!-- Filter chips -->
		<div class="timeline__filters">
			{#each FILTER_CATEGORIES as cat (cat.key)}
				{@const active = activeFilters.has(cat.key)}
				<button
					type="button"
					onclick={() => toggleFilter(cat.key)}
					class="timeline__filter-chip {active ? 'timeline__filter-chip--active' : ''}"
				>
					<i class={cat.icon} aria-hidden="true"></i>
					{cat.label}
				</button>
			{/each}
			{#if activeFilters.size > 0}
				<button
					type="button"
					onclick={() => { activeFilters = new Set(); }}
					class="timeline__filter-chip timeline__filter-chip--clear"
				>
					<i class="ri-close-line" aria-hidden="true"></i>
					Clear
				</button>
			{/if}
		</div>
	{/if}

	{#if loading}
		<SkeletonLoader lines={5} label="Loading timeline" />
	{:else if errorMsg}
		<p class="field__error">{errorMsg}</p>
	{:else if items.length === 0}
		{@const hasFilter = appliedSearch.length > 0 || activeFilters.size > 0}
		{@const emptyTitle = hasFilter ? 'No matching activity' : 'No activity yet'}
		{@const emptyDesc = hasFilter
			? appliedSearch
				? `Nothing in this contact's timeline matches "${appliedSearch}". Try another word or clear the filters.`
				: 'No activity matches the selected filters. Try adding more types or clearing them.'
			: 'Customer activity will appear here as your team communicates, schedules work, sends quotes, and records payments.'}
		<EmptyState title={emptyTitle} description={emptyDesc} iconClass="ri-time-line" />
	{:else}
		<ol class="timeline__list">
			{#each visibleItems as entry, i (entry.id)}
				{@const iconClass = getIcon(entry.icon_key)}
				{@const clickable = !!entry.link}
				{@const isNote = entry.type === 'notes'}

				{#if isNewDay(entry.created_at, visibleItems[i - 1]?.created_at ?? null)}
					<li class="timeline__day-sep">
						<span>{dayLabel(entry.created_at)}</span>
					</li>
				{/if}

				<li class="timeline__entry timeline__entry--{entry.tone} {clickable ? 'timeline__entry--clickable' : ''}">
					<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
					<div
						class="timeline__entry-inner"
						role={clickable ? 'button' : undefined}
						tabindex={clickable ? 0 : undefined}
						onclick={() => onEntryClick(entry)}
						onkeydown={(e) => {
							if (clickable && (e.key === 'Enter' || e.key === ' ')) {
								e.preventDefault();
								onEntryClick(entry);
							}
						}}
					>
						<span class="timeline__entry-icon timeline__entry-icon--{entry.tone}" aria-hidden="true">
							<i class={iconClass}></i>
						</span>
						<div class="timeline__entry-body">
							<p class="timeline__entry-desc">{entry.description}</p>
							<div class="timeline__entry-meta">
								<time title={entry.created_at}>{formatRelative(entry.created_at)}</time>
								{#if entry.link}
									<i class="ri-external-link-line" aria-hidden="true"></i>
								{/if}
							</div>
						</div>
						{#if isNote && canEdit}
							<button
								type="button"
								class="timeline__entry-delete"
								aria-label="Delete note"
								onclick={(e) => askDelete(entry, e)}
							>
								<i class="ri-delete-bin-line" aria-hidden="true"></i>
							</button>
						{/if}
					</div>
				</li>
			{/each}
		</ol>

		{#if compact}
			<!-- Toggle stays visible after expanding, flipping to "Show less" -->
			{#if items.length > COMPACT_LIMIT || nextCursor}
				<div class="timeline__load-more">
					<Button type="button" variant="ghost" size="sm" onclick={() => (expanded = !expanded)}>
						{collapsed ? 'Show more' : 'Show less'}
						<i
							class={collapsed ? 'ri-arrow-down-s-line' : 'ri-arrow-up-s-line'}
							aria-hidden="true"
						></i>
					</Button>
					{#if !collapsed && nextCursor}
						<Button
							type="button"
							variant="secondary"
							size="sm"
							loading={loadingMore}
							loadingLabel="Loading…"
							onclick={loadMore}
						>
							Load more
						</Button>
					{/if}
				</div>
			{/if}
		{:else if nextCursor}
			<div class="timeline__load-more">
				<Button
					type="button"
					variant="secondary"
					size="sm"
					loading={loadingMore}
					loadingLabel="Loading…"
					onclick={loadMore}
				>
					Load more
				</Button>
			</div>
		{/if}
	{/if}
</div>

<ConfirmDialog
	bind:open={confirmDeleteOpen}
	title="Delete note?"
	description="This will remove the note from this contact."
	confirmLabel="Delete"
	variant="destructive"
	loading={deleting}
	onConfirm={confirmDelete}
/>
