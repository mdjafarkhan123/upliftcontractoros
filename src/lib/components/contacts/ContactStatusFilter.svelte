<script lang="ts">
	import * as Tabs from '$lib/components/ui/tabs';

	let {
		value = $bindable<'all' | 'leads' | 'customers'>('all'),
		onChange
	}: {
		value?: 'all' | 'leads' | 'customers';
		onChange?: (next: 'all' | 'leads' | 'customers') => void;
	} = $props();

	function set(next: 'all' | 'leads' | 'customers') {
		value = next;
		onChange?.(next);
	}
</script>

<Tabs.Root value={value} onValueChange={(v: string) => set(v as 'all' | 'leads' | 'customers')}>
	<Tabs.List>
		<Tabs.Trigger value="all">All</Tabs.Trigger>
		<Tabs.Trigger value="leads">Leads</Tabs.Trigger>
		<Tabs.Trigger value="customers">Customers</Tabs.Trigger>
	</Tabs.List>
</Tabs.Root>
