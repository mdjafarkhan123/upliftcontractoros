<script lang="ts">
	import ListTabs, { type ListTab } from '$lib/components/shared/ListTabs.svelte';
	import type { InvoicesGroup, InvoicesStatusChip } from '$lib/types/invoices';

	let {
		group = $bindable<InvoicesGroup>('all'),
		status = $bindable<InvoicesStatusChip>('all')
	}: {
		group?: InvoicesGroup;
		status?: InvoicesStatusChip;
	} = $props();

	// Flat single-row status tabs (Jobber / QuickBooks receivables pattern). The old
	// group buckets (Open/Closed) + chip row are gone — the store's statusParam()
	// already resolves a single status to the right query, so group stays 'all' and
	// status drives everything.
	const tabs: ListTab<InvoicesStatusChip>[] = [
		{ value: 'all', label: 'All' },
		{ value: 'draft', label: 'Draft' },
		{ value: 'sent', label: 'Sent' },
		{ value: 'partially_paid', label: 'Partial' },
		{ value: 'overdue', label: 'Overdue' },
		{ value: 'paid', label: 'Paid' },
		{ value: 'cancelled', label: 'Cancelled' }
	];

	function onChange(next: InvoicesStatusChip) {
		status = next;
		group = 'all';
	}
</script>

<ListTabs {tabs} value={status} {onChange} ariaLabel="Filter invoices by status" />
