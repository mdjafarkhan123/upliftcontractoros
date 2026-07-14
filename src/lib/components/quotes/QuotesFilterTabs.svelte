<script lang="ts">
	import ListTabs, { type ListTab } from '$lib/components/shared/ListTabs.svelte';
	import type { QuotesGroup, QuotesStatusChip } from '$lib/types/quotes';

	let {
		group = $bindable<QuotesGroup>('all'),
		status = $bindable<QuotesStatusChip>('all')
	}: {
		group?: QuotesGroup;
		status?: QuotesStatusChip;
	} = $props();

	// Flat single-row status tabs (Jobber estimates pattern). The old
	// group buckets (Active/Closed) + chip row are gone — the store's
	// statusParam() already resolves a single status to the right query,
	// so group stays 'all' and status drives everything.
	const tabs: ListTab<QuotesStatusChip>[] = [
		{ value: 'all', label: 'All' },
		{ value: 'draft', label: 'Draft' },
		{ value: 'sent', label: 'Sent' },
		{ value: 'viewed', label: 'Viewed' },
		{ value: 'changes_requested', label: 'Changes' },
		{ value: 'accepted', label: 'Accepted' },
		{ value: 'declined', label: 'Declined' },
		{ value: 'expired', label: 'Expired' },
		{ value: 'deleted', label: 'Deleted' }
	];

	function onChange(next: QuotesStatusChip) {
		status = next;
		group = 'all';
	}
</script>

<ListTabs {tabs} value={status} {onChange} ariaLabel="Filter quotes by status" />
