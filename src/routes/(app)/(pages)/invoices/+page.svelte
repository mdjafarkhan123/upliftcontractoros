<script lang="ts">
	import PageWrapper from '$lib/components/shared/PageWrapper.svelte';
	import SkeletonLoader from '$lib/components/shared/SkeletonLoader.svelte';
	import EmptyState from '$lib/components/shared/EmptyState.svelte';
	import { Button } from '$lib/components/ui/button';
	import InvoicesFilterTabs from '$lib/components/invoices/InvoicesFilterTabs.svelte';
	import InvoiceListItem from '$lib/components/invoices/InvoiceListItem.svelte';
	import ListSearchBar from '$lib/components/shared/ListSearchBar.svelte';
	import { invoicesStore } from '$lib/stores/invoices.svelte';
	import type { InvoicesGroup, InvoicesStatusChip } from '$lib/types/invoices';
	import { Receipt, Plus } from '@lucide/svelte';
	import { goto } from '$app/navigation';

	let group = $state<InvoicesGroup>('all');
	let statusChip = $state<InvoicesStatusChip>('all');
	let searchValue = $state('');
	let search = $state('');
	const filters = $derived({ group, status: statusChip, search });

	$effect(() => {
		void invoicesStore.load(filters);
	});

	const items = $derived(invoicesStore.items);
	const nextCursor = $derived(invoicesStore.nextCursor);
	const status = $derived(invoicesStore.status);
	const errorMsg = $derived(invoicesStore.error);
	const showSkeleton = $derived(status === 'loading' && items.length === 0);
	const showError = $derived(status === 'error' && items.length === 0);

	let loadingMore = $state(false);
	async function loadMore() {
		if (!nextCursor || loadingMore) return;
		loadingMore = true;
		await invoicesStore.loadMore(filters);
		loadingMore = false;
	}
</script>

<svelte:head><title>Invoices</title></svelte:head>

<PageWrapper title="Invoices" subtitle="Sent, paid, and outstanding">
	{#snippet actions()}
		<Button onclick={() => goto('/invoices/new')}>
			<Plus class="mr-1 h-4 w-4" />New invoice
		</Button>
	{/snippet}

	<div class="space-y-4">
		<ListSearchBar
			bind:value={searchValue}
			placeholder="Search invoices by number, title, or client"
			onInput={(v) => (search = v)}
		/>

		<InvoicesFilterTabs bind:group bind:status={statusChip} />

		{#if showSkeleton}
			<SkeletonLoader lines={6} height="84px" label="Loading invoices" />
		{:else if showError}
			<p class="text-sm text-destructive">{errorMsg}</p>
		{:else if items.length === 0}
			{#if search}
				<EmptyState
					icon={Receipt}
					title="No invoices match your search"
					description={`No invoices found for “${search}”. Try an invoice number, title, or client name.`}
				/>
			{:else}
				<EmptyState
					icon={Receipt}
					title="No invoices yet"
					description="Invoices you create will appear here. Send one to a customer to start collecting payment."
					actionLabel="New invoice"
					onAction={() => goto('/invoices/new')}
				/>
			{/if}
		{:else}
			<ul class="grid gap-3">
				{#each items as invoice (invoice.id)}
					<li><InvoiceListItem {invoice} /></li>
				{/each}
			</ul>

			{#if nextCursor}
				<div class="flex justify-center pt-2">
					<Button variant="outline" disabled={loadingMore} onclick={loadMore}>
						{loadingMore ? 'Loading…' : 'Load more'}
					</Button>
				</div>
			{/if}
		{/if}
	</div>
</PageWrapper>
