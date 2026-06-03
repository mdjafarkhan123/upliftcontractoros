<script lang="ts">
	import { Popover } from 'bits-ui';
	import ChevronsUpDown from '@lucide/svelte/icons/chevrons-up-down';
	import Search from '@lucide/svelte/icons/search';
	import Check from '@lucide/svelte/icons/check';
	import Globe from '@lucide/svelte/icons/globe';
	import { cn } from '$lib/utils/cn';
	import {
		getTimezoneOptions,
		findTimezoneOption,
		type TimezoneOption
	} from '$lib/utils/timezones';

	let {
		value = $bindable<string>(''),
		id,
		placeholder = 'Select timezone',
		disabled = false,
		invalid = false,
		class: className = ''
	}: {
		value: string;
		id?: string;
		placeholder?: string;
		disabled?: boolean;
		invalid?: boolean;
		class?: string;
	} = $props();

	const all = getTimezoneOptions();
	const selected = $derived(findTimezoneOption(value));

	let open = $state(false);
	let query = $state('');
	let listEl = $state<HTMLDivElement | null>(null);
	let activeIndex = $state(0);

	const filtered = $derived.by(() => {
		const q = query.trim().toLowerCase();
		if (!q) return all;
		return all.filter((o) => o.searchKey.includes(q));
	});

	// Group filtered results by region so the dropdown reads like a directory.
	const grouped = $derived.by(() => {
		const map = new Map<string, TimezoneOption[]>();
		for (const o of filtered) {
			const arr = map.get(o.region);
			if (arr) arr.push(o);
			else map.set(o.region, [o]);
		}
		return Array.from(map.entries());
	});

	// Flat index of filtered items, used for keyboard nav (Arrow/Home/End/Enter).
	const flat = $derived(filtered);

	$effect(() => {
		// Reset cursor when the filter changes or the popover reopens.
		query;
		open;
		activeIndex = 0;
	});

	function onOpen(next: boolean) {
		open = next;
		if (!next) query = '';
	}

	function commit(option: TimezoneOption) {
		value = option.id;
		open = false;
		query = '';
	}

	function onKeydown(e: KeyboardEvent) {
		if (!open) return;
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			activeIndex = Math.min(activeIndex + 1, Math.max(0, flat.length - 1));
			scrollActiveIntoView();
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			activeIndex = Math.max(activeIndex - 1, 0);
			scrollActiveIntoView();
		} else if (e.key === 'Home') {
			e.preventDefault();
			activeIndex = 0;
			scrollActiveIntoView();
		} else if (e.key === 'End') {
			e.preventDefault();
			activeIndex = Math.max(0, flat.length - 1);
			scrollActiveIntoView();
		} else if (e.key === 'Enter') {
			e.preventDefault();
			const target = flat[activeIndex];
			if (target) commit(target);
		}
	}

	function scrollActiveIntoView() {
		if (!listEl) return;
		const node = listEl.querySelector<HTMLElement>(`[data-tz-index="${activeIndex}"]`);
		node?.scrollIntoView({ block: 'nearest' });
	}
</script>

<Popover.Root bind:open onOpenChange={onOpen}>
	<Popover.Trigger
		{id}
		{disabled}
		type="button"
		aria-invalid={invalid || undefined}
		class={cn(
			'flex h-11 w-full items-center justify-between gap-2 rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm ring-offset-background transition-all',
			'hover:border-border focus-visible:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
			'disabled:cursor-not-allowed disabled:opacity-50',
			'dark:border-white/10 dark:bg-card-raised/70',
			invalid && 'border-destructive/60 focus-visible:ring-destructive/40',
			className
		)}
	>
		<span class="flex min-w-0 flex-1 items-center gap-2 text-left">
			<Globe class="size-4 shrink-0 text-muted-foreground/70" />
			{#if selected}
				<span class="truncate font-medium text-foreground">{selected.city}</span>
				<span class="hidden truncate text-xs text-muted-foreground sm:inline">
					· {selected.region}
				</span>
				<span class="ml-auto shrink-0 text-xs tabular-nums text-muted-foreground">
					{selected.offsetLabel}
				</span>
			{:else if value}
				<!-- Stored value isn't in the IANA list — surface it so the user sees something is wrong. -->
				<span class="truncate text-destructive">{value}</span>
			{:else}
				<span class="truncate text-muted-foreground">{placeholder}</span>
			{/if}
		</span>
		<ChevronsUpDown class="size-4 shrink-0 text-muted-foreground/70" />
	</Popover.Trigger>

	<Popover.Portal>
		<Popover.Content
			sideOffset={6}
			align="start"
			class={cn(
				'z-50 w-[var(--bits-popover-anchor-width)] min-w-[18rem] overflow-hidden rounded-xl border border-border/60 bg-popover p-0 text-popover-foreground shadow-lg',
				'data-[state=open]:animate-in data-[state=closed]:animate-out',
				'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
				'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
				'data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2'
			)}
			onkeydown={onKeydown}
		>
			<div class="border-b border-border/60 px-2.5 py-2">
				<div class="relative">
					<Search
						class="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground/70"
					/>
					<!-- svelte-ignore a11y_autofocus -->
					<input
						autofocus
						bind:value={query}
						type="text"
						inputmode="search"
						placeholder="Search city, region, or offset…"
						class="h-9 w-full rounded-md border border-transparent bg-muted/40 pl-8 pr-2.5 text-sm text-foreground placeholder:text-muted-foreground/70 focus:border-primary/40 focus:bg-background focus:outline-none focus:ring-2 focus:ring-ring/40"
					/>
				</div>
			</div>

			<div bind:this={listEl} class="max-h-72 overflow-y-auto py-1">
				{#if flat.length === 0}
					<div class="px-3 py-8 text-center text-xs text-muted-foreground">
						No timezones match "{query}"
					</div>
				{:else}
					{#each grouped as [region, items] (region)}
						<div
							class="sticky top-0 z-10 bg-popover px-2.5 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70"
						>
							{region}
						</div>
						{#each items as opt (opt.id)}
							{@const flatIdx = flat.indexOf(opt)}
							{@const isActive = flatIdx === activeIndex}
							{@const isSelected = opt.id === value}
							<button
								type="button"
								data-tz-index={flatIdx}
								onmouseenter={() => (activeIndex = flatIdx)}
								onclick={() => commit(opt)}
								class={cn(
									'group flex w-full cursor-pointer select-none items-center gap-2 px-2.5 py-2 text-left text-sm outline-none transition-colors duration-100',
									isActive ? 'bg-accent text-accent-foreground' : 'text-foreground',
									isSelected && 'font-medium text-primary'
								)}
							>
								<span class="min-w-0 flex-1 truncate">{opt.city}</span>
								<span
									class={cn(
										'shrink-0 text-xs tabular-nums',
										isActive ? 'text-accent-foreground/80' : 'text-muted-foreground'
									)}
								>
									{opt.offsetLabel}
								</span>
								<Check
									class={cn(
										'size-3.5 shrink-0 text-primary transition-opacity',
										isSelected ? 'opacity-100' : 'opacity-0'
									)}
								/>
							</button>
						{/each}
					{/each}
				{/if}
			</div>
		</Popover.Content>
	</Popover.Portal>
</Popover.Root>
