<script lang="ts">
	import * as Tabs from '$lib/components/ui/tabs';
	import type { StatusFilter } from '$lib/stores/inbox.svelte';

	let {
		value = $bindable<StatusFilter>('open'),
		onChange
	}: {
		value?: StatusFilter;
		onChange?: (next: StatusFilter) => void;
	} = $props();

	function set(next: StatusFilter) {
		value = next;
		onChange?.(next);
	}
</script>

<Tabs.Root value={value} onValueChange={(v: string) => set(v as StatusFilter)}>
	<Tabs.List class="w-full justify-start overflow-x-auto">
		<Tabs.Trigger value="open">Open</Tabs.Trigger>
		<Tabs.Trigger value="snoozed">Snoozed</Tabs.Trigger>
		<Tabs.Trigger value="closed">Closed</Tabs.Trigger>
		<Tabs.Trigger value="all">All</Tabs.Trigger>
	</Tabs.List>
</Tabs.Root>
