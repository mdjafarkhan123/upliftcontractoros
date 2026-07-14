<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { tick, untrack } from 'svelte';
	import { fade, fly } from 'svelte/transition';
	import { commandPalette } from '$lib/stores/commandPalette.svelte';

	type SearchItem = { id: string; title: string; subtitle: string | null; href: string };
	type ResultMap = {
		contacts: SearchItem[];
		opportunities: SearchItem[];
		jobs: SearchItem[];
		quotes: SearchItem[];
		invoices: SearchItem[];
		appointments: SearchItem[];
	};

	const GROUPS = [
		{ key: 'contacts' as const, label: 'Contacts', icon: 'ri-contacts-line' },
		{ key: 'opportunities' as const, label: 'Pipeline', icon: 'ri-stack-line' },
		{ key: 'jobs' as const, label: 'Jobs', icon: 'ri-briefcase-line' },
		{ key: 'quotes' as const, label: 'Quotes', icon: 'ri-file-text-line' },
		{ key: 'invoices' as const, label: 'Invoices', icon: 'ri-receipt-line' },
		{ key: 'appointments' as const, label: 'Appointments', icon: 'ri-calendar-line' }
	];

	type GroupKey = (typeof GROUPS)[number]['key'];
	type FlatItem = SearchItem & { entity: GroupKey };

	let query = $state('');
	let results = $state<ResultMap | null>(null);
	let loading = $state(false);
	let activeIndex = $state(-1);
	let inputRef = $state<HTMLInputElement | null>(null);
	let controller: AbortController | null = null;

	const flatItems = $derived.by((): FlatItem[] => {
		const r = results;
		if (!r) return [];
		return GROUPS.flatMap((g) => (r[g.key] ?? []).map((item) => ({ ...item, entity: g.key })));
	});

	const hasResults = $derived(flatItems.length > 0);
	const showEmpty = $derived(
		results !== null && !hasResults && !loading && query.trim().length >= 2
	);

	// Reset + focus on open; abort in-flight on close
	$effect(() => {
		if (commandPalette.open) {
			query = '';
			results = null;
			activeIndex = -1;
			loading = false;
			tick().then(() => inputRef?.focus());
		} else {
			controller?.abort();
			controller = null;
			loading = false;
		}
	});

	// Debounced search trigger
	$effect(() => {
		const q = query.trim();
		activeIndex = -1;
		if (q.length < 2) {
			controller?.abort();
			loading = false;
			if (q.length === 0) results = null;
			return;
		}
		loading = true;
		const timer = setTimeout(() => void doSearch(q), 250);
		return () => clearTimeout(timer);
	});

	// Keep active item scrolled into view
	$effect(() => {
		if (activeIndex >= 0) {
			document.getElementById(`palette-item-${activeIndex}`)?.scrollIntoView({ block: 'nearest' });
		}
	});

	async function doSearch(q: string) {
		controller?.abort();
		controller = new AbortController();
		try {
			const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, {
				signal: controller.signal
			});
			if (!res.ok) throw new Error('search failed');
			const body = (await res.json()) as { data: ResultMap };
			results = body.data;
		} catch (e) {
			if ((e as Error).name === 'AbortError') return;
			results = {
				contacts: [],
				opportunities: [],
				jobs: [],
				quotes: [],
				invoices: [],
				appointments: []
			};
		} finally {
			loading = false;
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			commandPalette.open = false;
			return;
		}
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			if (activeIndex < flatItems.length - 1) activeIndex++;
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			if (activeIndex > 0) {
				activeIndex--;
			} else if (activeIndex === 0) {
				activeIndex = -1;
				inputRef?.focus();
			}
		} else if (e.key === 'Enter' && activeIndex >= 0) {
			e.preventDefault();
			const item = flatItems[activeIndex];
			if (item) navigate(item.href);
		}
	}

	function navigate(href: string) {
		commandPalette.open = false;
		void goto(href);
	}

	function clear() {
		query = '';
		inputRef?.focus();
	}

	function getFlatIndex(groupKey: GroupKey, itemId: string): number {
		return flatItems.findIndex((f) => f.entity === groupKey && f.id === itemId);
	}

	// Close on any SvelteKit navigation (browser back, sidebar links, etc.)
	$effect(() => {
		void page.url.pathname;
		untrack(() => {
			commandPalette.open = false;
		});
	});
</script>

{#if commandPalette.open}
	<!-- Backdrop -->
	<div
		role="presentation"
		class="command-palette__backdrop"
		transition:fade={{ duration: 120 }}
		onclick={() => (commandPalette.open = false)}
	></div>

	<!-- Palette panel -->
	<div
		role="dialog"
		aria-modal="true"
		aria-label="Quick search"
		tabindex="-1"
		class="command-palette__panel"
		transition:fly={{ y: -10, duration: 160, opacity: 0 }}
		onkeydown={handleKeydown}
	>
		<!-- Search input row -->
		<div class="command-palette__search">
			{#if loading}
				<i class="ri-loader-4-line command-palette__search-icon animate-spin" aria-hidden="true"
				></i>
			{:else}
				<i class="ri-search-line command-palette__search-icon" aria-hidden="true"></i>
			{/if}

			<input
				bind:this={inputRef}
				bind:value={query}
				type="text"
				role="combobox"
				aria-autocomplete="list"
				aria-expanded={hasResults}
				aria-controls="palette-listbox"
				aria-activedescendant={activeIndex >= 0 ? `palette-item-${activeIndex}` : undefined}
				placeholder="Search contacts, jobs, invoices…"
				class="command-palette__input"
				autocomplete="off"
				spellcheck={false}
			/>

			{#if query.length > 0}
				<button
					type="button"
					onclick={clear}
					class="command-palette__icon-btn"
					aria-label="Clear search"
				>
					<i class="ri-close-line" aria-hidden="true"></i>
				</button>
			{:else}
				<button
					type="button"
					onclick={() => (commandPalette.open = false)}
					class="command-palette__icon-btn command-palette__icon-btn--close"
					aria-label="Close"
				>
					<i class="ri-close-line" aria-hidden="true"></i>
				</button>
			{/if}
		</div>

		<!-- Results / states -->
		<div
			id="palette-listbox"
			role="listbox"
			aria-label="Search results"
			class="command-palette__results"
		>
			{#if !results && !loading}
				<!-- Idle -->
				<div class="command-palette__state">
					<i class="ri-search-line command-palette__state-icon" aria-hidden="true"></i>
					<p class="command-palette__state-text">
						Search across contacts, pipeline, jobs, quotes & more
					</p>
				</div>
			{:else if showEmpty}
				<!-- No results -->
				<div class="command-palette__state">
					<p class="command-palette__state-text">
						No results for <span class="command-palette__state-strong">"{query.trim()}"</span>
					</p>
					<p class="command-palette__state-hint">Try a different term or check the spelling</p>
				</div>
			{:else if hasResults}
				<!-- Grouped results -->
				<div class="command-palette__groups">
					{#each GROUPS as group (group.key)}
						{@const items = results?.[group.key] ?? []}
						{#if items.length > 0}
							<div class="command-palette__group">
								<!-- Section header -->
								<div class="command-palette__group-header">
									<i
										class="{group.icon} command-palette__icon command-palette__icon--header command-palette__icon--{group.key}"
										aria-hidden="true"
									></i>
									<span class="command-palette__group-label">{group.label}</span>
								</div>
								<!-- Items -->
								{#each items as item (item.id)}
									{@const flatIdx = getFlatIndex(group.key, item.id)}
									{@const isActive = flatIdx === activeIndex}
									<button
										id="palette-item-{flatIdx}"
										role="option"
										aria-selected={isActive}
										type="button"
										class="command-palette__item {isActive ? 'command-palette__item--active' : ''}"
										onclick={() => navigate(item.href)}
										onmouseenter={() => (activeIndex = flatIdx)}
									>
										<i
											class="{group.icon} command-palette__icon command-palette__icon--{group.key}"
											aria-hidden="true"
										></i>
										<div class="command-palette__item-body">
											<p class="command-palette__item-title">{item.title}</p>
											{#if item.subtitle}
												<p class="command-palette__item-subtitle">{item.subtitle}</p>
											{/if}
										</div>
									</button>
								{/each}
							</div>
						{/if}
					{/each}
				</div>
			{/if}
		</div>

		<!-- Keyboard hints (desktop only, shown when there are results) -->
		{#if hasResults}
			<div class="command-palette__footer">
				<span class="command-palette__hint">
					<kbd class="command-palette__kbd">↑</kbd>
					<kbd class="command-palette__kbd">↓</kbd>
					Navigate
				</span>
				<span class="command-palette__hint">
					<kbd class="command-palette__kbd">Enter</kbd>
					Open
				</span>
				<span class="command-palette__hint">
					<kbd class="command-palette__kbd">Esc</kbd>
					Close
				</span>
			</div>
		{/if}
	</div>
{/if}
