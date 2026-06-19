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
	import ContactFilterControl from '$lib/components/contacts/ContactFilterControl.svelte';
	import ContactListCard from '$lib/components/contacts/ContactListCard.svelte';
	import ContactListKpiStrip from '$lib/components/contacts/ContactListKpiStrip.svelte';
	import ContactTable from '$lib/components/contacts/ContactTable.svelte';
	import DeletedContactsList from '$lib/components/contacts/DeletedContactsList.svelte';
	import BulkActionBar from '$lib/components/contacts/BulkActionBar.svelte';
	import { getMemberContext } from '$lib/context/member';
	import { contactsStore } from '$lib/stores/contacts.svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import {
		Users,
		Trash2,
		Plus,
		CheckSquare,
		MoreHorizontal,
		Download,
		Upload,
		CalendarClock,
		X
	} from '@lucide/svelte';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import ContactImportModal from '$lib/components/contacts/ContactImportModal.svelte';
	import ConfirmDialog from '$lib/components/shared/ConfirmDialog.svelte';
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
	const showSkeleton = $derived(status === 'loading' && items.length === 0);
	const showError = $derived(status === 'error' && items.length === 0);
	const isDeletedView = $derived(statusFilter === 'deleted');

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
			<Button variant="outline" onclick={exitSelect}>Done</Button>
		{:else if !isDeletedView}
			<DropdownMenu.Root>
				<DropdownMenu.Trigger
					class="inline-flex min-h-[44px] w-10 items-center justify-center rounded-lg border border-input bg-background text-muted-foreground shadow-sm transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					aria-label="More actions"
				>
					<MoreHorizontal class="h-4 w-4" />
				</DropdownMenu.Trigger>
				<DropdownMenu.Content align="end">
					<DropdownMenu.Item onclick={triggerExport}>
						<Download class="h-4 w-4" /> Export CSV
					</DropdownMenu.Item>
					{#if canCreate}
						<DropdownMenu.Item onclick={() => (importOpen = true)}>
							<Upload class="h-4 w-4" /> Import CSV
						</DropdownMenu.Item>
					{/if}
				</DropdownMenu.Content>
			</DropdownMenu.Root>
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

	<div class="space-y-3">
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

		{#if followUp}
			<div class="flex items-center justify-between gap-2 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 dark:border-orange-500/20 dark:bg-orange-500/10">
				<span class="flex items-center gap-2 text-sm font-medium text-orange-800 dark:text-orange-300">
					<CalendarClock class="h-4 w-4" />
					Showing contacts with overdue follow-ups
				</span>
				<button
					type="button"
					onclick={() => (followUp = false)}
					class="inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs font-medium text-orange-700 transition-colors hover:bg-orange-100 dark:text-orange-300 dark:hover:bg-orange-500/20"
				>
					<X class="h-3.5 w-3.5" /> Clear
				</button>
			</div>
		{/if}

		<!-- ── Filter bar ─────────────────────────────────────────────────
		     Desktop: one row — [tabs flex-1] [search w-64] [filter button]
		     Mobile:  [tabs flex-1] [filter button] → search full-width below
		─────────────────────────────────────────────────────────────────── -->
		<div class="border-b border-border/60">
			<div class="flex items-end gap-2">
				<!-- Status tabs: flex-1, scrollable on mobile -->
				<div class="min-w-0 flex-1 overflow-x-hidden">
					<ContactStatusFilter
						bind:value={statusFilter}
						archivedCount={counts.archived}
						deletedCount={counts.deleted}
					/>
				</div>

				<!-- Desktop: search + filter -->
				<div class="hidden shrink-0 items-center gap-2 pb-2 lg:flex">
					<div class="w-64">
						<ContactSearchBar bind:value={searchInput} onInput={(v) => (q = v)} />
					</div>
					<ContactFilterControl bind:scope bind:tag bind:temperature showScope={canViewAll} />
				</div>

				<!-- Mobile: filter button only -->
				<div class="flex shrink-0 items-center pb-2 lg:hidden">
					<ContactFilterControl bind:scope bind:tag bind:temperature showScope={canViewAll} />
				</div>
			</div>
		</div>

		<!-- Mobile: search below the tab bar -->
		<div class="lg:hidden">
			<ContactSearchBar bind:value={searchInput} onInput={(v) => (q = v)} />
		</div>

		<!-- ── Content area ──────────────────────────────────────────────── -->
		{#if showSkeleton}
			<SkeletonLoader lines={6} label="Loading contacts" />
		{:else if showError}
			<p class="text-sm text-destructive">{errorMsg}</p>
		{:else if items.length === 0 && isDeletedView}
			<EmptyState
				icon={Trash2}
				title={q.trim() ? 'No matches' : 'Recycle bin is empty'}
				description={q.trim()
					? 'Try a different name, phone, or email.'
					: 'Deleted contacts appear here for 30 days, then are permanently removed. Restore one any time before then.'}
			/>
		{:else if items.length === 0 && followUp}
			<EmptyState
				icon={CalendarClock}
				title="You're all caught up"
				description="No contacts have an overdue follow-up right now."
				actionLabel="Clear filter"
				onAction={() => (followUp = false)}
			/>
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
		{:else if isDeletedView}
			<DeletedContactsList {items} {canRestore} {canPurge} onChanged={onBinChanged} />
			{#if nextCursor}
				<div class="flex justify-center pt-2">
					<Button variant="outline" disabled={loadingMore} onclick={loadMore}>
						{loadingMore ? 'Loading…' : 'Load more'}
					</Button>
				</div>
			{/if}
		{:else}
			<!-- Desktop: data table -->
			<div class="hidden lg:block">
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
			<div class="lg:hidden">
				{#if selectionMode}
					<div class="mb-3 flex items-center justify-between px-1">
						<button
							type="button"
							class="text-sm font-medium text-primary"
							onclick={toggleSelectAll}
						>
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
	<BulkActionBar
		ids={selectedIds}
		mode={statusFilter === 'archived' ? 'archived' : 'active'}
		canDelete={canPurge}
		onDone={onBulkDone}
		onCancel={exitSelect}
	/>
{/if}

<ContactImportModal bind:open={importOpen} onDone={onImportDone} />

{#if deleteTarget}
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
