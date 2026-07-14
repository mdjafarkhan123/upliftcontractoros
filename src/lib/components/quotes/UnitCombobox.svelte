<script lang="ts">
	import * as Popover from '$lib/components/ui/popover';
	import type { Attachment } from 'svelte/attachments';

	// Common contractor units of measure offered as suggestions. The contractor can
	// still type any custom unit (free text). Display-only — never touches totals.
	const COMMON_UNITS = [
		'each',
		'hour',
		'day',
		'sq ft',
		'sq yd',
		'linear ft',
		'cubic yd',
		'gallon',
		'ton',
		'bundle',
		'square',
		'roll',
		'sheet',
		'visit'
	];

	let {
		value = $bindable(''),
		onValueChange,
		disabled = false,
		placeholder = 'Unit',
		class: className = ''
	}: {
		value?: string;
		onValueChange?: (value: string) => void;
		disabled?: boolean;
		placeholder?: string;
		class?: string;
	} = $props();

	let open = $state(false);
	let query = $state('');

	const filtered = $derived(
		query.trim()
			? COMMON_UNITS.filter((u) => u.toLowerCase().includes(query.trim().toLowerCase()))
			: COMMON_UNITS
	);

	const showCustom = $derived(
		query.trim().length > 0 &&
			!COMMON_UNITS.some((u) => u.toLowerCase() === query.trim().toLowerCase())
	);

	function choose(u: string) {
		value = u;
		onValueChange?.(u);
		open = false;
		query = '';
	}

	function clear() {
		value = '';
		onValueChange?.('');
		open = false;
		query = '';
	}

	const focusOnMount: Attachment<HTMLInputElement> = (node) => {
		// preventScroll stops the browser from scrolling the page to bring the
		// freshly-focused input into view — that scroll is the "screen jump" on open.
		node.focus({ preventScroll: true });
	};
</script>

<Popover.Root
	bind:open
	onOpenChange={(o) => {
		if (o) query = value ?? '';
	}}
>
	<Popover.Trigger
		{disabled}
		class="unit-combo__trigger {!value ? 'unit-combo__trigger--placeholder' : ''} {className}"
	>
		<span class="unit-combo__label">{value || placeholder}</span>
		<i class="ri-arrow-down-s-line" aria-hidden="true"></i>
	</Popover.Trigger>
	<Popover.Content
		class="unit-combo__panel"
		align="start"
		onOpenAutoFocus={(e) => e.preventDefault()}
	>
		<div class="unit-combo__search">
			<input {@attach focusOnMount} bind:value={query} placeholder="Type or pick a unit…" />
		</div>
		<div class="unit-combo__list">
			{#each filtered as u (u)}
				<button type="button" class="unit-combo__option" onclick={() => choose(u)}>
					<span>{u}</span>
					{#if value === u}<i class="ri-check-line" aria-hidden="true"></i>{/if}
				</button>
			{/each}

			{#if showCustom}
				<button
					type="button"
					class="unit-combo__option unit-combo__option--custom"
					onclick={() => choose(query.trim())}
				>
					<i class="ri-add-line" aria-hidden="true"></i> Use “{query.trim()}”
				</button>
			{/if}

			{#if filtered.length === 0 && !showCustom}
				<p class="unit-combo__empty">No units</p>
			{/if}

			{#if value}
				<button type="button" class="unit-combo__option unit-combo__option--clear" onclick={clear}>
					<i class="ri-close-line" aria-hidden="true"></i> Clear unit
				</button>
			{/if}
		</div>
	</Popover.Content>
</Popover.Root>
