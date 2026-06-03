<script lang="ts">
	import { goto } from '$app/navigation';
	import EmptyState from '$lib/components/shared/EmptyState.svelte';
	import SkeletonLoader from '$lib/components/shared/SkeletonLoader.svelte';
	import ConfirmDialog from '$lib/components/shared/ConfirmDialog.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { getMemberContext } from '$lib/context/member';
	import { SvelteURLSearchParams } from 'svelte/reactivity';
	import {
		Search,
		X,
		Clock,
		MessageSquare,
		MessageCircle,
		FileText,
		Eye,
		CheckCircle2,
		XCircle,
		Receipt,
		DollarSign,
		Calendar,
		CalendarCheck,
		CalendarX,
		Briefcase,
		BriefcaseBusiness,
		Star,
		Send,
		AlertTriangle,
		StickyNote,
		Zap,
		PhoneMissed,
		Trash2,
		ExternalLink
	} from '@lucide/svelte';
	import type { Component } from 'svelte';

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
		icon: Component;
	};

	const FILTER_CATEGORIES: FilterCategory[] = [
		{ key: 'messages', label: 'Messages', icon: MessageCircle },
		{ key: 'quotes', label: 'Quotes', icon: FileText },
		{ key: 'invoices', label: 'Invoices', icon: Receipt },
		{ key: 'appointments', label: 'Appts', icon: Calendar },
		{ key: 'jobs', label: 'Jobs', icon: Briefcase },
		{ key: 'reviews', label: 'Reviews', icon: Star },
		{ key: 'notes', label: 'Notes', icon: StickyNote },
		{ key: 'automations', label: 'Auto', icon: Zap }
	];

	let { contactId }: { contactId: string } = $props();

	const member = getMemberContext();
	const canEdit = $derived(member().can_edit_contacts);

	let items = $state<TimelineEntry[]>([]);
	let nextCursor = $state<string | null>(null);
	let loading = $state(true);
	let loadingMore = $state(false);
	let errorMsg = $state<string | null>(null);

	// Free-text search. `searchInput` is the raw field value; `appliedSearch` is
	// the debounced term that actually drives the server query.
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

	function chipClass(active: boolean): string {
		return active
			? 'inline-flex shrink-0 items-center gap-1.5 rounded-full border border-primary bg-primary/10 text-primary px-3 py-1.5 text-xs font-medium transition-colors'
			: 'inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground px-3 py-1.5 text-xs font-medium transition-colors';
	}

	const ICONS: Record<string, Component> = {
		'message-in': MessageCircle,
		'message-out': MessageSquare,
		'quote-sent': FileText,
		'quote-viewed': Eye,
		'quote-accepted': CheckCircle2,
		'quote-declined': XCircle,
		'invoice-sent': Receipt,
		'invoice-paid': CheckCircle2,
		payment: DollarSign,
		appointment: Calendar,
		'appointment-completed': CalendarCheck,
		'appointment-cancelled': CalendarX,
		'job-created': Briefcase,
		'job-completed': BriefcaseBusiness,
		'job-cancelled': XCircle,
		'review-request': Send,
		review: Star,
		feedback: AlertTriangle,
		note: StickyNote,
		'automation-missed-call': PhoneMissed,
		'automation-quote-followup': Zap,
		'automation-invoice-reminder': Zap
	};

	const TONE_CLASSES: Record<Tone, string> = {
		neutral: 'bg-muted text-muted-foreground',
		positive: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
		attention: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
		negative: 'bg-destructive/10 text-destructive'
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
		// Clock skew between server/client can produce small future drift;
		// any future or sub-minute timestamp collapses to "Just now" instead
		// of rendering nonsense like "in -3 minutes" or "-60m ago".
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

	function getIcon(key: string): Component {
		return ICONS[key] ?? Clock;
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

{#if items.length > 0 || appliedSearch || activeFilters.size > 0}
	<div class="relative mb-3">
		<Search
			class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
		/>
		<Input
			type="search"
			inputmode="search"
			placeholder="Search timeline — quote, invoice, payment…"
			class="pl-10 pr-12"
			value={searchInput}
			oninput={onSearchInput}
		/>
		{#if searchInput}
			<button
				type="button"
				onclick={clearSearch}
				aria-label="Clear search"
				class="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
			>
				<X class="h-4 w-4" />
			</button>
		{/if}
	</div>

	<div class="mb-3 flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
		{#each FILTER_CATEGORIES as cat (cat.key)}
			{@const active = activeFilters.has(cat.key)}
			{@const FilterIcon = cat.icon}
			<button type="button" onclick={() => toggleFilter(cat.key)} class={chipClass(active)}>
				<FilterIcon class="h-3.5 w-3.5" />
				{cat.label}
			</button>
		{/each}
		{#if activeFilters.size > 0}
			<button
				type="button"
				onclick={() => {
					activeFilters = new Set();
				}}
				class="inline-flex shrink-0 items-center gap-1 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
			>
				<X class="h-3 w-3" />
				Clear
			</button>
		{/if}
	</div>
{/if}

{#if loading}
	<SkeletonLoader lines={5} label="Loading timeline" />
{:else if errorMsg}
	<p class="text-sm text-destructive">{errorMsg}</p>
{:else if items.length === 0}
	{@const hasFilter = appliedSearch.length > 0 || activeFilters.size > 0}
	{@const emptyTitle = hasFilter ? 'No matching activity' : 'No activity yet'}
	{@const emptyDesc = hasFilter
		? appliedSearch
			? `Nothing in this contact's timeline matches “${appliedSearch}”. Try another word or clear the filters.`
			: 'No activity matches the selected filters. Try adding more types or clearing them.'
		: 'Customer activity will appear here as your team communicates, schedules work, sends quotes, and records payments.'}
	<EmptyState title={emptyTitle} description={emptyDesc} icon={hasFilter ? Search : Clock} />
{:else}
	<ol class="space-y-3">
		{#each items as entry (entry.id)}
			{@const Icon = getIcon(entry.icon_key)}
			{@const clickable = !!entry.link}
			{@const isNote = entry.type === 'notes'}
			<li
				class="rounded-xl border border-border bg-card p-4 transition-colors {clickable
					? 'cursor-pointer hover:border-primary/40 hover:bg-accent/40'
					: ''}"
			>
				<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
				<div
					class="flex items-start gap-3"
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
					<span
						class="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full {TONE_CLASSES[
							entry.tone
						]}"
						aria-hidden="true"
					>
						<Icon class="h-4 w-4" />
					</span>
					<div class="min-w-0 flex-1">
						<p class="text-sm text-foreground">{entry.description}</p>
						<div class="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
							<time title={entry.created_at}>{formatRelative(entry.created_at)}</time>
							{#if entry.link}
								<ExternalLink class="h-3 w-3" aria-hidden="true" />
							{/if}
						</div>
					</div>
					{#if isNote && canEdit}
						<button
							type="button"
							class="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
							aria-label="Delete note"
							onclick={(e) => askDelete(entry, e)}
						>
							<Trash2 class="h-4 w-4" />
						</button>
					{/if}
				</div>
			</li>
		{/each}
	</ol>
	{#if nextCursor}
		<div class="mt-4 flex justify-center">
			<Button variant="outline" size="sm" disabled={loadingMore} onclick={loadMore}>
				{loadingMore ? 'Loading…' : 'Load more'}
			</Button>
		</div>
	{/if}
{/if}

<ConfirmDialog
	bind:open={confirmDeleteOpen}
	title="Delete note?"
	description="This will remove the note from this contact."
	confirmLabel="Delete"
	variant="destructive"
	loading={deleting}
	onConfirm={confirmDelete}
/>
