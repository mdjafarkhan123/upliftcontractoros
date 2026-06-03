<script lang="ts">
	import * as Tabs from '$lib/components/ui/tabs';

	export type ContactStatusValue = 'all' | 'leads' | 'customers' | 'archived';

	let {
		value = $bindable<ContactStatusValue>('all'),
		onChange
	}: {
		value?: ContactStatusValue;
		onChange?: (next: ContactStatusValue) => void;
	} = $props();

	function set(next: ContactStatusValue) {
		value = next;
		onChange?.(next);
	}
</script>

<Tabs.Root {value} onValueChange={(v: string) => set(v as ContactStatusValue)}>
	<Tabs.List>
		<Tabs.Trigger value="all">All</Tabs.Trigger>
		<Tabs.Trigger value="leads">Leads</Tabs.Trigger>
		<Tabs.Trigger value="customers">Customers</Tabs.Trigger>
		<Tabs.Trigger value="archived">Archived</Tabs.Trigger>
	</Tabs.List>
</Tabs.Root>
