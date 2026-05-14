<script lang="ts">
	import * as Tabs from '$lib/components/ui/tabs';
	import { cn } from '$lib/utils/cn';
	import type { QuotesGroup, QuotesStatusChip } from '$lib/types/quotes';

	let {
		group = $bindable<QuotesGroup>('all'),
		status = $bindable<QuotesStatusChip>('all')
	}: {
		group?: QuotesGroup;
		status?: QuotesStatusChip;
	} = $props();

	const activeChips: QuotesStatusChip[] = ['all', 'draft', 'sent', 'viewed'];
	const closedChips: QuotesStatusChip[] = ['all', 'accepted', 'declined', 'expired'];
	const chips = $derived(
		group === 'active' ? activeChips : group === 'closed' ? closedChips : (['all'] as QuotesStatusChip[])
	);

	const labels: Record<QuotesStatusChip, string> = {
		all: 'All',
		draft: 'Draft',
		sent: 'Sent',
		viewed: 'Viewed',
		accepted: 'Accepted',
		declined: 'Declined',
		expired: 'Expired'
	};

	function onGroupChange(v: string) {
		group = v as QuotesGroup;
		status = 'all';
	}
</script>

<div class="space-y-3">
	<Tabs.Root value={group} onValueChange={onGroupChange}>
		<Tabs.List class="w-full">
			<Tabs.Trigger value="all">All</Tabs.Trigger>
			<Tabs.Trigger value="active">Active</Tabs.Trigger>
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
