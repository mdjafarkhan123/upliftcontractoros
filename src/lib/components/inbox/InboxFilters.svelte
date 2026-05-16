<script lang="ts">
	import * as Tabs from '$lib/components/ui/tabs';
	import type { InboxFilter } from '$lib/stores/inbox.svelte';

	let {
		value = $bindable<InboxFilter>('all'),
		onChange
	}: {
		value?: InboxFilter;
		onChange?: (next: InboxFilter) => void;
	} = $props();

	function set(next: InboxFilter) {
		value = next;
		onChange?.(next);
	}
</script>

<Tabs.Root value={value} onValueChange={(v: string) => set(v as InboxFilter)}>
	<Tabs.List class="w-full justify-start overflow-x-auto">
		<Tabs.Trigger value="all">All</Tabs.Trigger>
		<Tabs.Trigger value="unread">Unread</Tabs.Trigger>
		<Tabs.Trigger value="sms">SMS</Tabs.Trigger>
		<Tabs.Trigger value="missed_calls">Missed Calls</Tabs.Trigger>
		<Tabs.Trigger value="webchat">Web Chat</Tabs.Trigger>
	</Tabs.List>
</Tabs.Root>
