<script lang="ts">
	import { cn } from '$lib/utils/cn';

	export type ContactStatusValue = 'all' | 'leads' | 'customers' | 'archived' | 'deleted';

	const TABS: { value: ContactStatusValue; label: string }[] = [
		{ value: 'all', label: 'All Contacts' },
		{ value: 'leads', label: 'Leads' },
		{ value: 'customers', label: 'Customers' },
		{ value: 'archived', label: 'Archived' },
		{ value: 'deleted', label: 'Recycle Bin' }
	];

	let {
		value = $bindable<ContactStatusValue>('all'),
		archivedCount = 0,
		deletedCount = 0,
		onChange
	}: {
		value?: ContactStatusValue;
		archivedCount?: number;
		deletedCount?: number;
		onChange?: (next: ContactStatusValue) => void;
	} = $props();

	function badgeFor(v: ContactStatusValue): number {
		if (v === 'archived') return archivedCount;
		if (v === 'deleted') return deletedCount;
		return 0;
	}

	function set(next: ContactStatusValue) {
		value = next;
		onChange?.(next);
	}
</script>

<div
	class="flex overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
	role="tablist"
	aria-label="Filter contacts by status"
>
	{#each TABS as tab (tab.value)}
		<button
			type="button"
			role="tab"
			aria-selected={value === tab.value}
			onclick={() => set(tab.value)}
			class={cn(
				'relative -mb-px shrink-0 whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium',
				'min-h-[44px] transition-colors duration-150',
				'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
				value === tab.value
					? 'border-primary text-foreground'
					: 'border-transparent text-muted-foreground hover:border-border/60 hover:text-foreground'
			)}
		>
			{tab.label}
			{#if badgeFor(tab.value) > 0}
				<span
					class={cn(
						'ml-1.5 inline-flex min-w-[1.25rem] items-center justify-center rounded-full px-1.5 py-0.5 text-xs font-semibold tabular-nums',
						value === tab.value
							? 'bg-primary/10 text-primary'
							: 'bg-muted text-muted-foreground'
					)}
				>
					{badgeFor(tab.value)}
				</span>
			{/if}
		</button>
	{/each}
</div>
