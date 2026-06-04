<script lang="ts">
	import { untrack } from 'svelte';
	import { goto, replaceState } from '$app/navigation';
	import { page } from '$app/state';
	import PageWrapper from '$lib/components/shared/PageWrapper.svelte';
	import SkeletonLoader from '$lib/components/shared/SkeletonLoader.svelte';
	import EmptyState from '$lib/components/shared/EmptyState.svelte';
	import { Button } from '$lib/components/ui/button';
	import ContactSearchBar from '$lib/components/contacts/ContactSearchBar.svelte';
	import ContactStatusFilter from '$lib/components/contacts/ContactStatusFilter.svelte';
	import ContactScopeFilter from '$lib/components/contacts/ContactScopeFilter.svelte';
	import ContactTagsFilter from '$lib/components/contacts/ContactTagsFilter.svelte';
	import ContactListCard from '$lib/components/contacts/ContactListCard.svelte';
	import BulkActionBar from '$lib/components/contacts/BulkActionBar.svelte';
	import { getMemberContext } from '$lib/context/member';
	import { contactsStore } from '$lib/stores/contacts.svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import { Users, Plus, CheckSquare } from '@lucide/svelte';

	type StatusValue = 'all' | 'leads' | 'customers' | 'archived';
	type ScopeValue = 'mine' | 'team' | 'unassigned';

	let { data } = $props<{
		data: {
			q: string;
			statusFilter: StatusValue;
			tag: string;
			scope: ScopeValue;
		};
	}>();

	const member = getMemberContext();
	const canViewAll = $derived(member().can_view_all_contacts);

	// `searchInput` is what the input is bound to (immediate); `q` is the
	// debounced value that drives the API call & URL sync. Debounce lives in
	// ContactSearchBar (250 ms) and only fires `onInput` when the user pauses.
	let searchInput = $state(untrack(() => data.q));
	let q = $state(untrack(() => data.q));
	let statusFilter = $state<StatusValue>(untrack(() => data.statusFilter));
	let tag = $state<string>(untrack(() => data.tag));
	let scope = $state<ScopeValue>(untrack(() => data.scope));

	const filters = $derived({ q, statusFilter, tag, scope });

	$effect(() => {
		void contactsStore.load(filters);
	});

	// URL-sync: keep the address bar in step with the active filter set so
	// reloads + share links work. replaceState (not pushState) means the back
	// button exits the page instead of walking through every filter change.
	$effect(() => {
		const f = filters;
		const url = new URL(page.url);
		const set = (k: string, v: string, keepWhen: (v: string) => boolean) => {
			if (keepWhen(v)) url.searchParams.set(k, v);
			else url.searchParams.delete(k);
		};
		set('q', f.q, (v) => v.trim().length > 0);
		set('status', f.statusFilter, (v) => v !== 'all');
		set('tag', f.tag, (v) => v.length > 0);
		set('scope', f.scope, (v) => v !== 'team');
		if (url.search !== page.url.search) {
			replaceState(`${url.pathname}${url.search}`, {});
		}
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
	const canBulk = $derived(member().can_edit_contacts);

	// --- Bulk selection ---
	let selectionMode = $state(false);
	const selected = new SvelteSet<string>();
	const selectedIds = $derived([...selected]);

	function enterSelect() {
		selectionMode = true;
	}
	function exitSelect() {
		selectionMode = false;
		selected.clear();
	}
	function toggleSelect(id: string) {
		if (selected.has(id)) selected.delete(id);
		else selected.add(id);
	}
	const allLoadedSelected = $derived(items.length > 0 && selected.size === items.length);
	function toggleSelectAll() {
		if (allLoadedSelected) selected.clear();
		else for (const c of items) selected.add(c.id);
	}
	async function onBulkDone(opts: { removedIds?: string[] }) {
		if (opts.removedIds?.length) contactsStore.removeMany(opts.removedIds);
		exitSelect();
		await contactsStore.load(filters, true);
	}
</script>

<svelte:head><title>Contacts</title></svelte:head>

<PageWrapper title="Contacts" subtitle="Your people pipeline">
	{#snippet actions()}
		{#if selectionMode}
			<Button variant="outline" onclick={exitSelect}>Done</Button>
		{:else}
			{#if canBulk}
				<Button variant="outline" onclick={enterSelect}>
					<CheckSquare class="h-4 w-4" /> Select
				</Button>
			{/if}
			{#if canCreate}
				<Button href="/contacts/new"><Plus class="h-4 w-4" /> New contact</Button>
			{/if}
		{/if}
	{/snippet}

	<div class="space-y-4">
		<ContactSearchBar bind:value={searchInput} onInput={(v) => (q = v)} />
		<ContactStatusFilter bind:value={statusFilter} />
		{#if canViewAll}
			<ContactScopeFilter bind:value={scope} />
		{/if}
		<ContactTagsFilter bind:value={tag} />

		{#if showSkeleton}
			<SkeletonLoader lines={6} label="Loading contacts" />
		{:else if showError}
			<p class="text-sm text-destructive">{errorMsg}</p>
		{:else if items.length === 0}
			<EmptyState
				icon={Users}
				title={q.trim() ? 'No matches' : 'No contacts yet'}
				description={q.trim()
					? 'Try a different name, phone, or email.'
					: canCreate
						? 'Add your first contact to start tracking conversations and jobs.'
						: 'New contacts will show up here as your team adds them.'}
				actionLabel={canCreate && !q.trim() ? 'Add contact' : undefined}
				onAction={canCreate && !q.trim() ? () => goto('/contacts/new') : undefined}
			/>
		{:else}
			{#if selectionMode}
				<div class="flex items-center justify-between px-1">
					<button type="button" class="text-sm font-medium text-primary" onclick={toggleSelectAll}>
						{allLoadedSelected ? 'Clear all' : 'Select all'}
					</button>
					<span class="text-xs text-muted-foreground">{selected.size} selected</span>
				</div>
			{/if}
			<ul class="grid gap-3" class:pb-24={selectionMode && selected.size > 0}>
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
							tags={c.tags}
							selectable={selectionMode}
							selected={selected.has(c.id)}
							onToggleSelect={toggleSelect}
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

{#if selectionMode && selectedIds.length > 0}
	<BulkActionBar ids={selectedIds} onDone={onBulkDone} onCancel={exitSelect} />
{/if}
