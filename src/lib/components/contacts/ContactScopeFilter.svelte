<script lang="ts">
	import * as Tabs from '$lib/components/ui/tabs';

	export type ContactScopeValue = 'mine' | 'team' | 'unassigned';

	let {
		value = $bindable<ContactScopeValue>('team'),
		onChange
	}: {
		value?: ContactScopeValue;
		onChange?: (next: ContactScopeValue) => void;
	} = $props();

	function set(next: ContactScopeValue) {
		value = next;
		onChange?.(next);
	}
</script>

<Tabs.Root {value} onValueChange={(v: string) => set(v as ContactScopeValue)}>
	<Tabs.List>
		<Tabs.Trigger value="mine">Mine</Tabs.Trigger>
		<Tabs.Trigger value="team">Team</Tabs.Trigger>
		<Tabs.Trigger value="unassigned">Unassigned</Tabs.Trigger>
	</Tabs.List>
</Tabs.Root>
