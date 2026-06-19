<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { tick, untrack } from 'svelte';
	import { fade, fly } from 'svelte/transition';
	import { cn } from '$lib/utils/cn';
	import { commandPalette } from '$lib/stores/commandPalette.svelte';
	import {
		Search,
		Users,
		Layers2,
		Briefcase,
		FileText,
		Receipt,
		CalendarDays,
		Loader2,
		X
	} from '@lucide/svelte';

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
		{ key: 'contacts' as const, label: 'Contacts', Icon: Users, color: 'text-emerald-500' },
		{ key: 'opportunities' as const, label: 'Pipeline', Icon: Layers2, color: 'text-amber-500' },
		{ key: 'jobs' as const, label: 'Jobs', Icon: Briefcase, color: 'text-blue-500' },
		{ key: 'quotes' as const, label: 'Quotes', Icon: FileText, color: 'text-violet-500' },
		{ key: 'invoices' as const, label: 'Invoices', Icon: Receipt, color: 'text-rose-500' },
		{
			key: 'appointments' as const,
			label: 'Appointments',
			Icon: CalendarDays,
			color: 'text-cyan-500'
		}
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
		class="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm"
		transition:fade={{ duration: 120 }}
		onclick={() => (commandPalette.open = false)}
	></div>

	<!-- Palette panel -->
	<div
		role="dialog"
		aria-modal="true"
		aria-label="Quick search"
		tabindex="-1"
		class="fixed inset-x-4 top-4 z-[101] overflow-hidden rounded-xl border border-border bg-background shadow-2xl md:inset-x-auto md:left-1/2 md:top-[10vh] md:w-[640px] md:-translate-x-1/2 md:rounded-2xl"
		transition:fly={{ y: -10, duration: 160, opacity: 0 }}
		onkeydown={handleKeydown}
	>
		<!-- Search input row -->
		<div class="flex items-center gap-3 border-b border-border/60 px-4 py-3 md:px-5 md:py-3.5">
			{#if loading}
				<Loader2 class="h-5 w-5 shrink-0 animate-spin text-muted-foreground" />
			{:else}
				<Search class="h-5 w-5 shrink-0 text-muted-foreground" />
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
				class="flex-1 bg-transparent text-[15px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none"
				autocomplete="off"
				spellcheck={false}
			/>

			{#if query.length > 0}
				<button
					type="button"
					onclick={clear}
					class="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					aria-label="Clear search"
				>
					<X class="h-4 w-4" />
				</button>
			{:else}
				<button
					type="button"
					onclick={() => (commandPalette.open = false)}
					class="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:hidden"
					aria-label="Close"
				>
					<X class="h-4 w-4" />
				</button>
			{/if}
		</div>

		<!-- Results / states -->
		<div
			id="palette-listbox"
			role="listbox"
			aria-label="Search results"
			class="overflow-y-auto overscroll-contain max-h-[60vh] md:max-h-[420px]"
		>
			{#if !results && !loading}
				<!-- Idle -->
				<div class="flex flex-col items-center justify-center gap-2 px-4 py-10 text-center">
					<Search class="h-8 w-8 text-muted-foreground/20" />
					<p class="text-sm text-muted-foreground">
						Search across contacts, pipeline, jobs, quotes & more
					</p>
				</div>
			{:else if showEmpty}
				<!-- No results -->
				<div class="flex flex-col items-center justify-center gap-1.5 px-4 py-10 text-center">
					<p class="text-sm text-foreground">
						No results for <span class="font-semibold">"{query.trim()}"</span>
					</p>
					<p class="text-xs text-muted-foreground">Try a different term or check the spelling</p>
				</div>
			{:else if hasResults}
				<!-- Grouped results -->
				<div class="py-2">
					{#each GROUPS as group (group.key)}
						{@const items = results?.[group.key] ?? []}
						{#if items.length > 0}
							{@const GroupIcon = group.Icon}
							<div class="px-2 pb-1 last:pb-0">
								<!-- Section header -->
								<div class="flex items-center gap-2 px-3 py-1.5">
									<GroupIcon class={cn('h-3 w-3 shrink-0', group.color)} />
									<span
										class="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60"
									>
										{group.label}
									</span>
								</div>
								<!-- Items -->
								<div class="space-y-px">
									{#each items as item (item.id)}
										{@const flatIdx = getFlatIndex(group.key, item.id)}
										{@const isActive = flatIdx === activeIndex}
										<button
											id="palette-item-{flatIdx}"
											role="option"
											aria-selected={isActive}
											type="button"
											class={cn(
												'flex min-h-[44px] w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors duration-75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
												isActive ? 'bg-accent' : 'hover:bg-accent/50'
											)}
											onclick={() => navigate(item.href)}
											onmouseenter={() => (activeIndex = flatIdx)}
										>
											<GroupIcon class={cn('h-4 w-4 shrink-0', group.color)} />
											<div class="min-w-0 flex-1">
												<p class="truncate text-sm font-medium text-foreground">{item.title}</p>
												{#if item.subtitle}
													<p class="truncate text-xs text-muted-foreground">{item.subtitle}</p>
												{/if}
											</div>
										</button>
									{/each}
								</div>
							</div>
						{/if}
					{/each}
				</div>
			{/if}
		</div>

		<!-- Keyboard hints (desktop only, shown when there are results) -->
		{#if hasResults}
			<div
				class="hidden items-center gap-5 border-t border-border/60 bg-muted/20 px-5 py-2 md:flex"
			>
				<span class="flex items-center gap-1.5 text-xs text-muted-foreground">
					<kbd
						class="inline-flex h-5 min-w-[20px] items-center justify-center rounded border border-border bg-background px-1 font-mono text-[10px]"
						>↑</kbd
					>
					<kbd
						class="inline-flex h-5 min-w-[20px] items-center justify-center rounded border border-border bg-background px-1 font-mono text-[10px]"
						>↓</kbd
					>
					Navigate
				</span>
				<span class="flex items-center gap-1.5 text-xs text-muted-foreground">
					<kbd
						class="inline-flex h-5 items-center justify-center rounded border border-border bg-background px-1.5 font-mono text-[10px]"
						>Enter</kbd
					>
					Open
				</span>
				<span class="flex items-center gap-1.5 text-xs text-muted-foreground">
					<kbd
						class="inline-flex h-5 items-center justify-center rounded border border-border bg-background px-1.5 font-mono text-[10px]"
						>Esc</kbd
					>
					Close
				</span>
			</div>
		{/if}
	</div>
{/if}
