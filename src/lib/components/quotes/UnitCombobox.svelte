<script lang="ts">
	import * as Popover from '$lib/components/ui/popover';
	import { cn } from '$lib/utils/cn';
	import { Check, ChevronDown, X } from '@lucide/svelte';
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
		class={cn(
			'flex h-9 w-full items-center justify-between gap-1 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors hover:bg-accent/40 focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
			!value && 'text-muted-foreground',
			className
		)}
	>
		<span class="truncate">{value || placeholder}</span>
		<ChevronDown class="h-3.5 w-3.5 shrink-0 opacity-50" />
	</Popover.Trigger>
	<Popover.Content
		class="w-52 p-0"
		align="start"
		onOpenAutoFocus={(e) => e.preventDefault()}
	>
		<div class="border-b border-border p-2">
			<input
				{@attach focusOnMount}
				bind:value={query}
				placeholder="Type or pick a unit…"
				class="h-8 w-full rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
			/>
		</div>
		<div class="max-h-56 overflow-y-auto p-1">
			{#each filtered as u (u)}
				<button
					type="button"
					class="flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-sm transition-colors hover:bg-accent"
					onclick={() => choose(u)}
				>
					<span>{u}</span>
					{#if value === u}<Check class="h-3.5 w-3.5 text-primary" />{/if}
				</button>
			{/each}

			{#if showCustom}
				<button
					type="button"
					class="flex w-full items-center gap-1.5 rounded-sm px-2 py-1.5 text-sm text-primary transition-colors hover:bg-accent"
					onclick={() => choose(query.trim())}
				>
					<span class="text-base leading-none">+</span> Use “{query.trim()}”
				</button>
			{/if}

			{#if filtered.length === 0 && !showCustom}
				<p class="px-2 py-1.5 text-sm text-muted-foreground">No units</p>
			{/if}

			{#if value}
				<button
					type="button"
					class="mt-1 flex w-full items-center gap-1.5 rounded-sm border-t border-border px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-destructive"
					onclick={clear}
				>
					<X class="h-3.5 w-3.5" /> Clear unit
				</button>
			{/if}
		</div>
	</Popover.Content>
</Popover.Root>
