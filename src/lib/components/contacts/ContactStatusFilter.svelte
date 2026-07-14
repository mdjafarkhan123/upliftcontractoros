<script lang="ts">
	import ListTabs, { type ListTab } from '$lib/components/shared/ListTabs.svelte';

	export type ContactStatusValue = 'all' | 'leads' | 'customers' | 'archived' | 'deleted';

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

	const tabs = $derived<ListTab<ContactStatusValue>[]>([
		{ value: 'all', label: 'All Contacts' },
		{ value: 'leads', label: 'Leads' },
		{ value: 'customers', label: 'Customers' },
		{ value: 'archived', label: 'Archived', count: archivedCount },
		{ value: 'deleted', label: 'Recycle Bin', count: deletedCount }
	]);
</script>

<ListTabs {tabs} bind:value {onChange} ariaLabel="Filter contacts by status" />
