<script lang="ts">
	import { Popover } from 'bits-ui';
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
		class="tz-combo__trigger {className}"
	>
		<span class="tz-combo__value">
			<i class="tz-combo__globe ri-global-line" aria-hidden="true"></i>
			{#if selected}
				<span class="tz-combo__city">{selected.city}</span>
				<span class="tz-combo__region">· {selected.region}</span>
				<span class="tz-combo__offset">{selected.offsetLabel}</span>
			{:else if value}
				<!-- Stored value isn't in the IANA list — surface it so the user sees something is wrong. -->
				<span class="tz-combo__invalid">{value}</span>
			{:else}
				<span class="tz-combo__placeholder">{placeholder}</span>
			{/if}
		</span>
		<i class="tz-combo__caret ri-expand-up-down-line" aria-hidden="true"></i>
	</Popover.Trigger>

	<Popover.Portal>
		<Popover.Content sideOffset={6} align="start" class="tz-combo__panel" onkeydown={onKeydown}>
			<div class="tz-combo__search">
				<i class="tz-combo__search-icon ri-search-line" aria-hidden="true"></i>
				<!-- svelte-ignore a11y_autofocus -->
				<input
					autofocus
					bind:value={query}
					type="text"
					inputmode="search"
					placeholder="Search city, region, or offset…"
					class="tz-combo__input"
				/>
			</div>

			<div bind:this={listEl} class="tz-combo__list">
				{#if flat.length === 0}
					<div class="tz-combo__empty">No timezones match "{query}"</div>
				{:else}
					{#each grouped as [region, items] (region)}
						<div class="tz-combo__group-label">{region}</div>
						{#each items as opt (opt.id)}
							{@const flatIdx = flat.indexOf(opt)}
							{@const isActive = flatIdx === activeIndex}
							{@const isSelected = opt.id === value}
							<button
								type="button"
								data-tz-index={flatIdx}
								onmouseenter={() => (activeIndex = flatIdx)}
								onclick={() => commit(opt)}
								class="tz-combo__opt"
								class:tz-combo__opt--active={isActive}
								class:tz-combo__opt--selected={isSelected}
							>
								<span class="tz-combo__opt-city">{opt.city}</span>
								<span class="tz-combo__opt-offset">{opt.offsetLabel}</span>
								<i
									class="tz-combo__opt-check ri-check-line"
									class:tz-combo__opt-check--on={isSelected}
									aria-hidden="true"
								></i>
							</button>
						{/each}
					{/each}
				{/if}
			</div>
		</Popover.Content>
	</Popover.Portal>
</Popover.Root>
