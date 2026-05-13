<script lang="ts">
	import { goto } from '$app/navigation';
	import PageWrapper from '$lib/components/shared/PageWrapper.svelte';
	import SkeletonLoader from '$lib/components/shared/SkeletonLoader.svelte';
	import EmptyState from '$lib/components/shared/EmptyState.svelte';
	import { Button } from '$lib/components/ui/button';
	import ContactSearchBar from '$lib/components/contacts/ContactSearchBar.svelte';
	import ContactStatusFilter from '$lib/components/contacts/ContactStatusFilter.svelte';
	import ContactListCard from '$lib/components/contacts/ContactListCard.svelte';
	import { getMemberContext } from '$lib/context/member';
	import { contactsStore } from '$lib/stores/contacts.svelte';
	import { Users, Plus } from '@lucide/svelte';

	let { data } = $props<{ data: { q: string; statusFilter: 'all' | 'leads' | 'customers' } }>();

	const member = getMemberContext();

	let search = $state(data.q);
	let statusFilter = $state<'all' | 'leads' | 'customers'>(data.statusFilter);

	// Reactive filter object — drives load() whenever it changes.
	const filters = $derived({ q: search, statusFilter });

	$effect(() => {
		// Stale-while-revalidate: if cached for these filters and fresh, returns instantly.
		// Otherwise revalidates in background (keeps current items visible) or shows skeleton on cold.
		void contactsStore.load(filters);
	});

	const items = $derived(contactsStore.items);
	const nextCursor = $derived(contactsStore.nextCursor);
	const status = $derived(contactsStore.status);
	const errorMsg = $derived(contactsStore.error);
	const showSkeleton = $derived(status === 'loading' && items.length === 0);
	const showError = $derived(status === 'error' && items.length === 0);

	let loadingMore = $state(false);
	async function loadMore() {
		if (!nextCursor || loadingMore) return;
		loadingMore = true;
		await contactsStore.loadMore(filters);
		loadingMore = false;
	}

	const canCreate = $derived(member().can_create_contacts);
</script>

<svelte:head><title>Contacts</title></svelte:head>

<PageWrapper title="Contacts" subtitle="Your people pipeline">
	{#snippet actions()}
		{#if canCreate}
			<Button href="/contacts/new"><Plus class="h-4 w-4" /> New contact</Button>
		{/if}
	{/snippet}

	<div class="space-y-4">
		<ContactSearchBar bind:value={search} />
		<ContactStatusFilter bind:value={statusFilter} />

		{#if showSkeleton}
			<SkeletonLoader lines={6} label="Loading contacts" />
		{:else if showError}
			<p class="text-sm text-destructive">{errorMsg}</p>
		{:else if items.length === 0}
			<EmptyState
				icon={Users}
				title={search.trim() ? 'No matches' : 'No contacts yet'}
				description={search.trim()
					? 'Try a different name, phone, or email.'
					: canCreate
						? 'Add your first contact to start tracking conversations and jobs.'
						: 'New contacts will show up here as your team adds them.'}
				actionLabel={canCreate && !search.trim() ? 'Add contact' : undefined}
				onAction={canCreate && !search.trim() ? () => goto('/contacts/new') : undefined}
			/>
		{:else}
			<ul class="grid gap-3">
				{#each items as c (c.id)}
					<li>
						<ContactListCard
							id={c.id}
							full_name={c.full_name}
							phone={c.phone}
							email={c.email}
							status={c.status}
							assignee_name={c.assignee_name}
							sms_opt_out={c.sms_opt_out}
						/>
					</li>
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
