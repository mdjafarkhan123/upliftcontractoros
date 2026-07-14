<script lang="ts">
	import { goto } from '$app/navigation';
	import { SvelteURLSearchParams } from 'svelte/reactivity';
	import { Button } from '$lib/components/ui/button';

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

	type FilterCategory = { key: string; label: string; icon: string };

	// Job-scoped subset of the contact timeline's categories — a single job only ever
	// produces lifecycle, visit, invoice, and review events (Jobber "Activity feed").
	const FILTER_CATEGORIES: FilterCategory[] = [
		{ key: 'jobs', label: 'Job', icon: 'ri-briefcase-line' },
		{ key: 'appointments', label: 'Visits', icon: 'ri-calendar-line' },
		{ key: 'invoices', label: 'Invoices', icon: 'ri-receipt-line' },
		{ key: 'reviews', label: 'Reviews', icon: 'ri-star-line' }
	];

	// `reloadKey` is bumped by the parent page after a save/status change so the feed
	// re-fetches instead of staying stale until a manual reload.
	let { jobId, reloadKey = 0 }: { jobId: string; reloadKey?: number } = $props();

	let items = $state<TimelineEntry[]>([]);
	let nextCursor = $state<string | null>(null);
	let loading = $state(true);
	let loadingMore = $state(false);
	let errorMsg = $state<string | null>(null);
	let activeFilters = $state<Set<string>>(new Set());

	// Server owns icon/tone/description/link; the client only maps the icon_key to a class.
	const ICONS: Record<string, string> = {
		'job-created': 'ri-briefcase-line',
		'job-completed': 'ri-briefcase-4-line',
		'job-cancelled': 'ri-close-circle-line',
		appointment: 'ri-calendar-line',
		'appointment-completed': 'ri-calendar-check-line',
		'appointment-cancelled': 'ri-calendar-close-line',
		'invoice-sent': 'ri-receipt-line',
		'invoice-paid': 'ri-checkbox-circle-line',
		payment: 'ri-money-dollar-circle-line',
		'review-request': 'ri-send-plane-line',
		review: 'ri-star-line',
		feedback: 'ri-alert-line'
	};

	function toggleFilter(key: string) {
		const next = new Set(activeFilters);
		if (next.has(key)) next.delete(key);
		else next.add(key);
		activeFilters = next;
	}

	// Per-run token guards against an older request resolving after a newer one.
	let fetchToken = 0;
	async function load(cursor: string | null, filters: Set<string>, token: number) {
		const params = new SvelteURLSearchParams();
		if (cursor) params.set('cursor', cursor);
		if (filters.size > 0) params.set('types', [...filters].join(','));
		const res = await fetch(`/api/jobs/${jobId}/timeline?${params.toString()}`);
		if (token !== fetchToken) return;
		if (!res.ok) {
			errorMsg = 'Failed to load activity.';
			return;
		}
		const body = (await res.json()) as { items: TimelineEntry[]; next_cursor: string | null };
		if (token !== fetchToken) return;
		items = cursor ? [...items, ...body.items] : body.items;
		nextCursor = body.next_cursor;
	}

	$effect(() => {
		void [jobId, reloadKey];
		const filters = activeFilters;
		const token = ++fetchToken;
		loading = true;
		errorMsg = null;
		load(null, filters, token).finally(() => {
			if (token === fetchToken) loading = false;
		});
	});

	async function loadMore() {
		if (!nextCursor || loadingMore) return;
		loadingMore = true;
		await load(nextCursor, activeFilters, fetchToken);
		loadingMore = false;
	}

	function formatRelative(iso: string): string {
		const then = new Date(iso).getTime();
		const diffMs = Date.now() - then;
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
</script>

<section class="job-section">
	<div class="job-section__head">
		<div class="job-section__head-main">
			<i class="ri-history-line job-section__icon" aria-hidden="true"></i>
			<h2 class="job-section__title">Activity</h2>
		</div>
	</div>

	<div class="timeline">
		{#if items.length > 0 || activeFilters.size > 0}
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
						onclick={() => {
							activeFilters = new Set();
						}}
						class="timeline__filter-chip timeline__filter-chip--clear"
					>
						<i class="ri-close-line" aria-hidden="true"></i>
						Clear
					</button>
				{/if}
			</div>
		{/if}

		{#if loading}
			<p class="job-section__empty">Loading…</p>
		{:else if errorMsg}
			<p class="job-section__empty job-section__empty--error">{errorMsg}</p>
		{:else if items.length === 0}
			{@const hasFilter = activeFilters.size > 0}
			<p class="job-section__empty">
				{hasFilter
					? 'No activity matches the selected filters.'
					: 'Activity on this job — visits, invoices, and status changes — will appear here.'}
			</p>
		{:else}
			<ol class="timeline__list">
				{#each items as entry, i (entry.id)}
					{@const iconClass = getIcon(entry.icon_key)}
					{@const clickable = !!entry.link}

					{#if isNewDay(entry.created_at, items[i - 1]?.created_at ?? null)}
						<li class="timeline__day-sep">
							<span>{dayLabel(entry.created_at)}</span>
						</li>
					{/if}

					<li
						class="timeline__entry timeline__entry--{entry.tone} {clickable
							? 'timeline__entry--clickable'
							: ''}"
					>
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
							<span
								class="timeline__entry-icon timeline__entry-icon--{entry.tone}"
								aria-hidden="true"
							>
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
						</div>
					</li>
				{/each}
			</ol>

			{#if nextCursor}
				<div class="timeline__load-more">
					<Button
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
</section>
