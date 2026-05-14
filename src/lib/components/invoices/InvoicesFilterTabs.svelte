<script lang="ts">
	import * as Tabs from '$lib/components/ui/tabs';
	import { cn } from '$lib/utils/cn';
	import type { InvoicesGroup, InvoicesStatusChip } from '$lib/types/invoices';

	let {
		group = $bindable<InvoicesGroup>('all'),
		status = $bindable<InvoicesStatusChip>('all')
	}: {
		group?: InvoicesGroup;
		status?: InvoicesStatusChip;
	} = $props();

	const openChips: InvoicesStatusChip[] = ['all', 'draft', 'sent', 'partially_paid', 'overdue'];
	const closedChips: InvoicesStatusChip[] = ['all', 'paid', 'cancelled'];
	const chips = $derived(
		group === 'open'
			? openChips
			: group === 'closed'
				? closedChips
				: (['all'] as InvoicesStatusChip[])
	);

	const labels: Record<InvoicesStatusChip, string> = {
		all: 'All',
		draft: 'Draft',
		sent: 'Sent',
		partially_paid: 'Partial',
		paid: 'Paid',
		overdue: 'Overdue',
		cancelled: 'Cancelled'
	};

	function onGroupChange(v: string) {
		group = v as InvoicesGroup;
		status = 'all';
	}
</script>

<div class="space-y-3">
	<Tabs.Root value={group} onValueChange={onGroupChange}>
		<Tabs.List class="w-full">
			<Tabs.Trigger value="all">All</Tabs.Trigger>
			<Tabs.Trigger value="open">Open</Tabs.Trigger>
			<Tabs.Trigger value="closed">Closed</Tabs.Trigger>
		</Tabs.List>
	</Tabs.Root>

	{#if chips.length > 1}
		<div class="-mx-1 flex flex-wrap gap-2 px-1">
			{#each chips as chip (chip)}
				<button
					type="button"
					onclick={() => (status = chip)}
					class={cn(
						'min-h-[36px] rounded-full px-3 text-xs font-medium transition-colors',
						status === chip
							? 'bg-foreground text-background'
							: 'bg-muted text-muted-foreground hover:bg-muted/80'
					)}
				>
					{labels[chip]}
				</button>
			{/each}
		</div>
	{/if}
</div>
