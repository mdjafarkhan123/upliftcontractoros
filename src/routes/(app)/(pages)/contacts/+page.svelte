<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { untrack } from 'svelte';
	import { goto, replaceState } from '$app/navigation';
	import { page } from '$app/state';
	import PageWrapper from '$lib/components/shared/PageWrapper.svelte';
	import ListPageShell from '$lib/components/shared/ListPageShell.svelte';
	import SkeletonLoader from '$lib/components/shared/SkeletonLoader.svelte';
	import EmptyState from '$lib/components/shared/EmptyState.svelte';
	import ContactSearchBar from '$lib/components/contacts/ContactSearchBar.svelte';
	import ContactStatusFilter from '$lib/components/contacts/ContactStatusFilter.svelte';
	import ContactFilterControl from '$lib/components/contacts/ContactFilterControl.svelte';
	import ContactListCard from '$lib/components/contacts/ContactListCard.svelte';
	import ContactListKpiStrip from '$lib/components/contacts/ContactListKpiStrip.svelte';
	import ContactTable from '$lib/components/contacts/ContactTable.svelte';
	import BulkActionBar from '$lib/components/contacts/BulkActionBar.svelte';
	import { getMemberContext } from '$lib/context/member';
	import { contactsStore } from '$lib/stores/contacts.svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { toast } from '$lib/stores/toast.svelte';

	type StatusValue = 'all' | 'leads' | 'customers' | 'archived' | 'deleted';
	type ScopeValue = 'mine' | 'team' | 'unassigned';
	type TemperatureValue = '' | 'hot' | 'warm' | 'cold';

	let { data } = $props<{
		data: {
			q: string;
			statusFilter: StatusValue;
			tag: string;
			temperature: TemperatureValue;
			source: string;
			followUp: boolean;
			scope: ScopeValue;
		};
	}>();

	const member = getMemberContext();
	const canViewAll = $derived(member().can_view_all_contacts);

	let searchInput = $state(untrack(() => data.q));
	let q = $state(untrack(() => data.q));
	let statusFilter = $state<StatusValue>(untrack(() => data.statusFilter));
	let tag = $state<string>(untrack(() => data.tag));
	let temperature = $state<TemperatureValue>(untrack(() => data.temperature));
	let source = $state<string>(untrack(() => data.source));
	let followUp = $state<boolean>(untrack(() => data.followUp));
	let scope = $state<ScopeValue>(untrack(() => data.scope));

	const filters = $derived({ q, statusFilter, tag, temperature, source, followUp, scope });

	$effect(() => {
		void contactsStore.load(filters);
	});

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
		set('temp', f.temperature, (v) => v.length > 0);
		set('source', f.source, (v) => v.length > 0);
		if (f.followUp) url.searchParams.set('follow_up', 'overdue');
		else url.searchParams.delete('follow_up');
		set('scope', f.scope, (v) => v !== 'team');
		if (url.search !== page.url.search) {
			replaceState(`${url.pathname}${url.search}`, {});
		}
	});

	const items = $derived(contactsStore.items);
	const nextCursor = $derived(contactsStore.nextCursor);
	const status = $derived(contactsStore.status);
	const errorMsg = $derived(contactsStore.error);
	const isDeletedView = $derived(statusFilter === 'deleted');

	// The recycle-bin list is only ever seen on the Deleted tab. Load it lazily so
	// the contacts list paints without its chunk on the critical path — it fetches
	// the moment the Deleted tab is opened and is cached thereafter.
	let DeletedContactsList = $state<
		typeof import('$lib/components/contacts/DeletedContactsList.svelte').default | null
	>(null);
	$effect(() => {
		if (!isDeletedView || DeletedContactsList) return;
		void import('$lib/components/contacts/DeletedContactsList.svelte').then((m) => {
			DeletedContactsList = m.default;
		});
	});

	// Tab badge counts (Archived, Recycle Bin). Loaded once on mount and refreshed
	// whenever the bin changes (restore / permanent delete).
	let counts = $state({ leads: 0, customers: 0, needs_follow_up: 0, archived: 0, deleted: 0 });
	async function loadCounts() {
		try {
			const res = await fetch('/api/contacts/summary');
			if (res.ok) counts = ((await res.json()) as { data: typeof counts }).data;
		} catch {
			// non-critical — badges just stay stale
		}
	}
	$effect(() => {
		void loadCounts();
	});

	const canRestore = $derived(member().can_create_contacts);
	// Bulk-delete permission for the active/archived selection bar.
	const canPurge = $derived(member().can_delete_contacts);

	function onBinChanged(id: string) {
		contactsStore.remove(id);
		void loadCounts();
	}

	// Selection/bulk actions don't apply to the recycle bin — leave select mode
	// if the user switches into it while selecting.
	$effect(() => {
		if (isDeletedView && selectionMode) exitSelect();
	});

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
		void loadCounts();
	}

	// --- Archive (active → off the active list, reversible) ---
	let mutatingId = $state<string | null>(null);

	async function handleArchiveRequest(id: string, full_name: string) {
		if (mutatingId) return;
		mutatingId = id;
		try {
			const res = await fetch(`/api/contacts/${id}`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ status: 'archived' })
			});
			if (res.ok) {
				toast.success(`${full_name} archived`);
				await contactsStore.load(filters, true);
				void loadCounts();
			} else {
				const body = await res.json().catch(() => ({}));
				toast.error(body.error ?? 'Failed to archive contact');
			}
		} finally {
			mutatingId = null;
		}
	}

	// --- Restore (archived → back to active as customer/lead) ---
	async function handleRestoreRequest(id: string, full_name: string) {
		if (mutatingId) return;
		mutatingId = id;
		try {
			const res = await fetch('/api/contacts/bulk', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ action: 'unarchive', contact_ids: [id] })
			});
			if (res.ok) {
				toast.success(`${full_name} restored`);
				await contactsStore.load(filters, true);
				void loadCounts();
			} else {
				const body = await res.json().catch(() => ({}));
				toast.error(body.error ?? 'Failed to restore contact');
			}
		} finally {
			mutatingId = null;
		}
	}

	// --- Delete (active or archived → Recycle Bin, recoverable 30 days) ---
	// The dialog opens instantly; linked-record counts load in the background and
	// only enrich the confirmation copy — they never block the popup.
	let deleteTarget = $state<{ id: string; full_name: string } | null>(null);
	let deleteCounts = $state<{
		opportunities: number;
		jobs: number;
		quotes: number;
		invoices: number;
		conversations: number;
	} | null>(null);
	let deleteDialogOpen = $state(false);
	let deleteBusy = $state(false);

	const deleteLinkedCount = $derived(
		deleteCounts
			? deleteCounts.opportunities +
					deleteCounts.jobs +
					deleteCounts.quotes +
					deleteCounts.invoices +
					deleteCounts.conversations
			: 0
	);
	const deleteDescription = $derived(
		deleteTarget
			? `${deleteTarget.full_name} will move to the Recycle Bin — you can restore it within 30 days.` +
					(deleteLinkedCount > 0
						? ` This also hides ${deleteLinkedCount} linked record${deleteLinkedCount === 1 ? '' : 's'} (jobs, quotes, invoices…), all restorable together.`
						: '')
			: ''
	);

	function handleDeleteRequest(id: string, full_name: string) {
		deleteTarget = { id, full_name };
		deleteCounts = null;
		deleteDialogOpen = true;
		// Fetch linked-record counts in the background — non-blocking.
		void (async () => {
			try {
				const res = await fetch(`/api/contacts/${id}`);
				if (res.ok && deleteTarget?.id === id) {
					const body = await res.json();
					deleteCounts = body.counts;
				}
			} catch {
				// Counts are a heads-up only — the dialog works without them.
			}
		})();
	}

	async function handleDeleteConfirm() {
		if (!deleteTarget || deleteBusy) return;
		deleteBusy = true;
		try {
			const res = await fetch(`/api/contacts/${deleteTarget.id}`, { method: 'DELETE' });
			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				toast.error(body.error ?? 'Delete failed');
				return;
			}
			const name = deleteTarget.full_name;
			contactsStore.remove(deleteTarget.id);
			void loadCounts();
			toast.success(`${name} moved to Recycle Bin`);
			deleteDialogOpen = false;
		} finally {
			deleteBusy = false;
		}
	}

	// --- Import / Export ---
	let importOpen = $state(false);

	// The CSV import modal (drag-drop, column mapping, parsing) is heavy and only
	// needed when the user chooses Import. Load it the first time they open it.
	let ContactImportModal = $state<
		typeof import('$lib/components/contacts/ContactImportModal.svelte').default | null
	>(null);
	$effect(() => {
		if (!importOpen || ContactImportModal) return;
		void import('$lib/components/contacts/ContactImportModal.svelte').then((m) => {
			ContactImportModal = m.default;
		});
	});

	// The delete confirmation dialog only renders once a delete is requested.
	let ConfirmDialog = $state<
		typeof import('$lib/components/shared/ConfirmDialog.svelte').default | null
	>(null);
	$effect(() => {
		if (!deleteDialogOpen || ConfirmDialog) return;
		void import('$lib/components/shared/ConfirmDialog.svelte').then((m) => {
			ConfirmDialog = m.default;
		});
	});

	function triggerExport() {
		const params = new URLSearchParams();
		if (q.trim()) params.set('q', q.trim());
		if (statusFilter !== 'all') params.set('status', statusFilter);
		if (tag) params.set('tag', tag);
		if (temperature) params.set('temp', temperature);
		if (source) params.set('source', source);
		if (followUp) params.set('follow_up', 'overdue');
		if (scope !== 'team') params.set('scope', scope);
		const a = document.createElement('a');
		a.href = `/api/contacts/export?${params.toString()}`;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
	}

	async function onImportDone() {
		await contactsStore.load(filters, true);
	}
</script>

<svelte:head><title>Contacts</title></svelte:head>

<PageWrapper title="Contacts" subtitle="Your people pipeline">
	{#snippet actions()}
		{#if selectionMode}
			<Button type="button" variant="secondary" onclick={exitSelect}>Done</Button>
		{:else if !isDeletedView}
			<DropdownMenu.Root>
				<DropdownMenu.Trigger class="btn btn--secondary btn--icon" aria-label="More actions">
					<i class="ri-more-2-fill" aria-hidden="true"></i>
				</DropdownMenu.Trigger>
				<DropdownMenu.Content align="end">
					<DropdownMenu.Item onclick={triggerExport}>
						<i class="ri-download-line" aria-hidden="true"></i> Export CSV
					</DropdownMenu.Item>
					{#if canCreate}
						<DropdownMenu.Item onclick={() => (importOpen = true)}>
							<i class="ri-upload-line" aria-hidden="true"></i> Import CSV
						</DropdownMenu.Item>
					{/if}
				</DropdownMenu.Content>
			</DropdownMenu.Root>
			{#if canBulk}
				<Button type="button" variant="secondary" onclick={enterSelect}>
					<i class="ri-checkbox-line" aria-hidden="true"></i> Select
				</Button>
			{/if}
			{#if canCreate}
				<a class="btn btn--primary" href="/contacts/new">
					<i class="ri-add-line" aria-hidden="true"></i> New contact
				</a>
			{/if}
		{/if}
	{/snippet}

	<ListPageShell
		{status}
		itemCount={items.length}
		{errorMsg}
		nextCursor={isDeletedView && !DeletedContactsList ? null : nextCursor}
		{loadingMore}
		onLoadMore={loadMore}
		skeletonLines={6}
		skeletonLabel="Loading contacts"
	>
		{#snippet kpi()}
			{#if !isDeletedView}
				<ContactListKpiStrip
					total={counts.leads + counts.customers}
					leads={counts.leads}
					customers={counts.customers}
					needsFollowUp={counts.needs_follow_up}
					activeFollowUp={followUp}
					onSelectStatus={(s) => {
						followUp = false;
						statusFilter = s;
					}}
					onToggleFollowUp={() => {
						if (followUp) {
							followUp = false;
						} else {
							statusFilter = 'all';
							followUp = true;
						}
					}}
				/>
			{/if}
		{/snippet}

		{#snippet tabs()}
			<ContactStatusFilter
				bind:value={statusFilter}
				archivedCount={counts.archived}
				deletedCount={counts.deleted}
			/>
		{/snippet}

		{#snippet search()}
			<ContactSearchBar bind:value={searchInput} onInput={(v) => (q = v)} />
		{/snippet}

		{#snippet filter()}
			<ContactFilterControl bind:scope bind:tag bind:temperature showScope={canViewAll} />
		{/snippet}

		{#snippet banner()}
			{#if followUp}
				<div class="followup-banner">
					<span class="followup-banner__text">
						<i class="ri-calendar-schedule-line" aria-hidden="true"></i>
						Showing contacts with overdue follow-ups
					</span>
					<button type="button" onclick={() => (followUp = false)} class="followup-banner__clear">
						<i class="ri-close-line" aria-hidden="true"></i> Clear
					</button>
				</div>
			{/if}
		{/snippet}

		{#snippet empty()}
			{#if isDeletedView}
				<EmptyState
					iconClass="ri-delete-bin-line"
					title={q.trim() ? 'No matches' : 'Recycle bin is empty'}
					description={q.trim()
						? 'Try a different name, phone, or email.'
						: 'Deleted contacts appear here for 30 days, then are permanently removed. Restore one any time before then.'}
				/>
			{:else if followUp}
				<EmptyState
					iconClass="ri-calendar-schedule-line"
					title="You're all caught up"
					description="No contacts have an overdue follow-up right now."
					actionLabel="Clear filter"
					onAction={() => (followUp = false)}
				/>
			{:else}
				<EmptyState
					iconClass="ri-group-line"
					title={q.trim() ? 'No matches' : 'No contacts yet'}
					description={q.trim()
						? 'Try a different name, phone, or email.'
						: canCreate
							? 'Add your first contact to start tracking conversations and jobs.'
							: 'New contacts will show up here as your team adds them.'}
					actionLabel={canCreate && !q.trim() ? 'Add contact' : undefined}
					onAction={canCreate && !q.trim() ? () => goto('/contacts/new') : undefined}
				/>
			{/if}
		{/snippet}

		{#snippet content()}
			{#if isDeletedView}
				{#if DeletedContactsList}
					<DeletedContactsList {items} {canRestore} onChanged={onBinChanged} />
				{:else}
					<SkeletonLoader lines={6} label="Loading recycle bin" />
				{/if}
			{:else}
				<!-- Desktop: data table -->
				<div class="contacts-page__table">
					<ContactTable
						{items}
						selectable={selectionMode}
						{selected}
						onToggleSelect={toggleSelect}
						onToggleAll={toggleSelectAll}
						allSelected={allLoadedSelected}
						onArchiveRequest={handleArchiveRequest}
						onRestoreRequest={handleRestoreRequest}
						onDeleteRequest={handleDeleteRequest}
					/>
				</div>

				<!-- Mobile: card list -->
				<div class="contacts-page__cards">
					{#if selectionMode}
						<div class="contacts-page__select-head">
							<button type="button" class="contacts-page__select-all" onclick={toggleSelectAll}>
								{allLoadedSelected ? 'Clear all' : 'Select all'}
							</button>
							<span class="contacts-page__select-count">{selected.size} selected</span>
						</div>
					{/if}
					<ul
						class="contacts-page__card-list"
						class:contacts-page__card-list--pad={selectionMode && selected.size > 0}
					>
						{#each items as c (c.id)}
							<li>
								<ContactListCard
									id={c.id}
									full_name={c.full_name}
									company_name={c.company_name}
									avatar_url={c.avatar_url}
									phone={c.phone}
									email={c.email}
									status={c.status}
									assignee_name={c.assignee_name}
									lead_source={c.lead_source}
									lead_temperature={c.lead_temperature}
									sms_opt_out={c.sms_opt_out}
									tags={c.tags}
									last_contacted_at={c.last_contacted_at}
									selectable={selectionMode}
									selected={selected.has(c.id)}
									onToggleSelect={toggleSelect}
									onArchiveRequest={handleArchiveRequest}
									onRestoreRequest={handleRestoreRequest}
									onDeleteRequest={handleDeleteRequest}
								/>
							</li>
						{/each}
					</ul>
				</div>
			{/if}
		{/snippet}
	</ListPageShell>
</PageWrapper>

{#if selectionMode && selectedIds.length > 0}
	<BulkActionBar
		ids={selectedIds}
		mode={statusFilter === 'archived' ? 'archived' : 'active'}
		canDelete={canPurge}
		onDone={onBulkDone}
		onCancel={exitSelect}
	/>
{/if}

{#if ContactImportModal}
	<ContactImportModal bind:open={importOpen} onDone={onImportDone} />
{/if}

{#if deleteTarget && ConfirmDialog}
	<ConfirmDialog
		bind:open={deleteDialogOpen}
		title="Delete {deleteTarget.full_name}?"
		description={deleteDescription}
		confirmLabel="Move to Recycle Bin"
		variant="destructive"
		loading={deleteBusy}
		onConfirm={handleDeleteConfirm}
	/>
{/if}

<style lang="scss">
	@use '$lib/styles/tokens' as *;

	// Toolbar / search / load-more / skeleton now live in <ListPageShell>. Only the
	// contacts-specific table + mobile card + selection styles remain here.
	.contacts-page {
		&__table {
			display: none;
			@media (min-width: $bp-tablet) {
				display: block;
			}
		}
		&__cards {
			@media (min-width: $bp-tablet) {
				display: none;
			}
		}

		&__select-head {
			display: flex;
			align-items: center;
			justify-content: space-between;
			margin-bottom: $space-3;
			padding: 0 $space-1;
		}
		&__select-all {
			border: none;
			background: transparent;
			color: var(--color-brand);
			font: inherit;
			font-size: $fs-body;
			font-weight: $weight-medium;
			cursor: pointer;
		}
		&__select-count {
			font-size: $fs-caption;
			color: var(--color-text-secondary);
		}

		&__card-list {
			display: grid;
			gap: $space-3;
			&--pad {
				padding-bottom: 6rem;
			}
		}
	}
</style>
