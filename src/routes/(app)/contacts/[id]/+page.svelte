<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import * as Tabs from '$lib/components/ui/tabs';
	import PageWrapper from '$lib/components/shared/PageWrapper.svelte';
	import SkeletonLoader from '$lib/components/shared/SkeletonLoader.svelte';
	import EmptyState from '$lib/components/shared/EmptyState.svelte';
	import DeleteContactDialog from '$lib/components/contacts/DeleteContactDialog.svelte';
	import ContactDetailHeader from '$lib/components/contacts/ContactDetailHeader.svelte';
	import ContactKpiStrip from '$lib/components/contacts/ContactKpiStrip.svelte';
	import MergeContactDialog from '$lib/components/contacts/MergeContactDialog.svelte';
	import ContactQuickActions from '$lib/components/contacts/ContactQuickActions.svelte';
	import SmsOptOutBanner from '$lib/components/contacts/SmsOptOutBanner.svelte';
	import TimelineTab from '$lib/components/contacts/TimelineTab.svelte';
	import NotesTab from '$lib/components/contacts/NotesTab.svelte';
	import AddressesTab from '$lib/components/contacts/AddressesTab.svelte';
	import AttachmentsTab from '$lib/components/contacts/AttachmentsTab.svelte';
	import LinkedRecordsTab from '$lib/components/contacts/LinkedRecordsTab.svelte';
	import { getMemberContext } from '$lib/context/member';
	import { toast } from '$lib/stores/toast.svelte';
	import {
		Clock,
		CalendarClock,
		MessageSquare,
		GitBranch,
		Briefcase,
		FileText,
		Receipt,
		ChevronRight,
		CheckCircle2
	} from '@lucide/svelte';
	import { formatDateTime } from '$lib/utils/format';
	import { cn } from '$lib/utils/cn';
	import type { ContactDetailResponse } from './+page';

	let { data }: { data: { id: string } } = $props();

	const member = getMemberContext();

	let detail = $state<ContactDetailResponse | null>(null);
	let loading = $state(true);
	let errorMsg = $state<string | null>(null);

	let activeTab = $state<'timeline' | 'notes' | 'addresses' | 'files' | 'linked'>('timeline');
	let notesComposerOpen = $state(false);

	let bindableNotes = $state<ContactDetailResponse['notes']>([]);
	let bindableAddresses = $state<ContactDetailResponse['addresses']>([]);

	const assigneeName = $derived(detail?.assignee?.name ?? null);

	onMount(async () => {
		try {
			const res = await fetch(`/api/contacts/${data.id}`);
			if (res.status === 404) {
				errorMsg = 'Contact not found.';
				return;
			}
			if (res.status === 403) {
				errorMsg = 'You do not have access to this contact.';
				return;
			}
			if (!res.ok) {
				errorMsg = 'Failed to load contact.';
				return;
			}
			const body = (await res.json()) as ContactDetailResponse;
			detail = body;
			bindableNotes = body.notes;
			bindableAddresses = body.addresses;
		} catch {
			errorMsg = 'Failed to load contact.';
		} finally {
			loading = false;
		}
	});

	function openAddNote() {
		activeTab = 'notes';
		notesComposerOpen = true;
	}

	function applyOptimisticPatch(patch: { status?: 'customer'; next_follow_up_at?: string | null }) {
		if (!detail) return;
		const now = new Date().toISOString();
		const next = { ...detail.contact };
		if (patch.status) {
			next.status = patch.status;
			if (next.converted_at === null) next.converted_at = now;
		}
		if (patch.next_follow_up_at !== undefined) next.next_follow_up_at = patch.next_follow_up_at;
		next.updated_at = now;
		detail = { ...detail, contact: next };
	}

	const canEdit = $derived(member().can_edit_contacts);
	const canDelete = $derived(member().can_delete_contacts);
	const canMerge = $derived(member().can_merge_contacts);

	let mergeOpen = $state(false);

	async function reloadDetail() {
		const res = await fetch(`/api/contacts/${data.id}`);
		if (res.ok) {
			const body = (await res.json()) as ContactDetailResponse;
			detail = body;
			bindableNotes = body.notes;
			bindableAddresses = body.addresses;
		}
	}

	async function onMerged(survivorId: string) {
		const { contactsStore } = await import('$lib/stores/contacts.svelte');
		contactsStore.invalidate();
		if (survivorId === data.id) await reloadDetail();
		else goto(`/contacts/${survivorId}`);
	}

	// --- Archive / Unarchive ---
	let archiveBusy = $state(false);

	async function setStatus(nextStatus: 'lead' | 'customer' | 'archived', successMsg: string) {
		if (!detail || archiveBusy) return;
		archiveBusy = true;
		try {
			const res = await fetch(`/api/contacts/${detail.contact.id}`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ status: nextStatus })
			});
			const body = await res.json().catch(() => ({}));
			if (res.ok) {
				detail = {
					...detail,
					contact: { ...detail.contact, status: nextStatus, updated_at: body.contact.updated_at }
				};
				const { contactsStore } = await import('$lib/stores/contacts.svelte');
				contactsStore.invalidate();
				toast.success(successMsg);
			} else if (res.status === 409 && body.code === 'CONTACT_HAS_LINKS') {
				toast.error('Close or reassign linked jobs, quotes, and invoices before archiving.');
			} else {
				toast.error(body.error ?? 'Failed to update contact.');
			}
		} catch {
			toast.error('Failed to update contact.');
		} finally {
			archiveBusy = false;
		}
	}

	function archiveContact() {
		void setStatus('archived', 'Contact archived');
	}
	function unarchiveContact() {
		// No stored pre-archive status; a converted contact returns to customer,
		// otherwise to lead.
		void setStatus(
			detail?.contact.converted_at ? 'customer' : 'lead',
			'Contact restored to active'
		);
	}

	let confirmDeleteOpen = $state(false);

	async function performDelete() {
		if (!detail) return;
		const res = await fetch(`/api/contacts/${detail.contact.id}`, { method: 'DELETE' });
		if (res.ok) {
			goto('/contacts');
			return;
		}
		const body = await res.json().catch(() => ({}));
		throw new Error(body.error ?? 'Failed to delete contact.');
	}

	// Sidebar linked record rows
	const sidebarRecords = $derived(
		detail
			? [
					{
						label: 'Opportunities',
						count: detail.counts.opportunities,
						href: `/pipeline?contact=${detail.contact.id}`,
						icon: GitBranch
					},
					{
						label: 'Jobs',
						count: detail.counts.jobs,
						href: `/jobs?contact_id=${detail.contact.id}`,
						icon: Briefcase
					},
					{
						label: 'Quotes',
						count: detail.counts.quotes,
						href: `/quotes?contact=${detail.contact.id}`,
						icon: FileText
					},
					{
						label: 'Invoices',
						count: detail.counts.invoices,
						href: `/invoices?contact=${detail.contact.id}`,
						icon: Receipt
					},
					{
						label: 'Conversations',
						count: detail.counts.conversations,
						href: `/inbox?contact=${detail.contact.id}`,
						icon: MessageSquare
					}
				]
			: []
	);

	const followUpOverdue = $derived(
		detail?.contact.next_follow_up_at !== null &&
			detail?.contact.next_follow_up_at !== undefined &&
			new Date(detail.contact.next_follow_up_at).getTime() <= Date.now()
	);

	const methodLabel = $derived(
		detail?.contact.preferred_contact_method
			? detail.contact.preferred_contact_method[0].toUpperCase() +
					detail.contact.preferred_contact_method.slice(1)
			: null
	);
</script>

<svelte:head><title>{detail?.contact.full_name ?? 'Contact'}</title></svelte:head>

<PageWrapper>
	{#if loading}
		<SkeletonLoader lines={6} height="60px" label="Loading contact" />
	{:else if errorMsg || !detail}
		<EmptyState title="Couldn't load contact" description={errorMsg ?? 'Unknown error.'} />
	{:else}
		<div class="space-y-4">
			<!-- Header -->
			<ContactDetailHeader
				contact_id={detail.contact.id}
				full_name={detail.contact.full_name}
				company_name={detail.contact.company_name}
				avatar_url={detail.contact.avatar_url}
				phone={detail.contact.phone}
				alt_phone={detail.contact.alt_phone}
				alt_phone_label={detail.contact.alt_phone_label}
				email={detail.contact.email}
				status={detail.contact.status}
				assignee_name={assigneeName}
				referrer={detail.referrer}
				lead_temperature={detail.contact.lead_temperature}
				next_follow_up_at={detail.contact.next_follow_up_at}
				do_not_contact={detail.contact.do_not_contact}
				{canEdit}
				{canDelete}
				{canMerge}
				{archiveBusy}
				onMerge={() => (mergeOpen = true)}
				onBack={() => {
					if (page.url.search) goto('/contacts');
					else history.back();
				}}
				onEdit={() => goto(`/contacts/${detail!.contact.id}/edit`)}
				onDelete={() => {
					confirmDeleteOpen = true;
				}}
				onArchive={archiveContact}
				onUnarchive={unarchiveContact}
				onAvatarChange={(r) => {
					if (!detail) return;
					detail = {
						...detail,
						contact: { ...detail.contact, avatar_url: r.avatar_url, updated_at: r.updated_at }
					};
				}}
			/>

			{#if detail.contact.sms_opt_out}
				<SmsOptOutBanner
					source={detail.contact.sms_opt_out_source}
					opted_out_at={detail.contact.sms_opt_out_at}
				/>
			{/if}

			<!-- KPI Strip -->
			<ContactKpiStrip
				lifetime_revenue={detail.kpi.lifetime_revenue}
				open_quotes_count={detail.kpi.open_quotes_count}
				open_quotes_value={detail.kpi.open_quotes_value}
				active_jobs_count={detail.kpi.active_jobs_count}
				last_contacted_at={detail.contact.last_contacted_at}
				next_follow_up_at={detail.contact.next_follow_up_at}
				contactId={detail.contact.id}
			/>

			<!-- Mobile: Quick Actions -->
			<div class="md:hidden">
				<ContactQuickActions
					contactId={detail.contact.id}
					contactName={detail.contact.full_name}
					phone={detail.contact.phone}
					status={detail.contact.status}
					nextFollowUpAt={detail.contact.next_follow_up_at}
					onAddNote={openAddNote}
					onUpdated={applyOptimisticPatch}
				/>
			</div>

			<!-- Main content: tabs left, sidebar right on desktop -->
			<div class="flex gap-6">
				<!-- Tabs — full width on mobile, 60% on desktop -->
				<div class="min-w-0 flex-1">
					<Tabs.Root bind:value={activeTab}>
						<Tabs.List class="w-full">
							<Tabs.Trigger value="timeline">Timeline</Tabs.Trigger>
							<Tabs.Trigger value="notes">Notes</Tabs.Trigger>
							<Tabs.Trigger value="addresses">Addresses</Tabs.Trigger>
							<Tabs.Trigger value="files">Files</Tabs.Trigger>
							<Tabs.Trigger value="linked" class="md:hidden">Linked</Tabs.Trigger>
						</Tabs.List>

						<Tabs.Content value="timeline">
							<TimelineTab contactId={detail.contact.id} />
						</Tabs.Content>

						<Tabs.Content value="notes">
							<NotesTab
								contactId={detail.contact.id}
								bind:notes={bindableNotes}
								{canEdit}
								bind:composerOpen={notesComposerOpen}
							/>
						</Tabs.Content>

						<Tabs.Content value="addresses">
							<AddressesTab
								contactId={detail.contact.id}
								bind:addresses={bindableAddresses}
								{canEdit}
							/>
						</Tabs.Content>

						<Tabs.Content value="files">
							<AttachmentsTab contactId={detail.contact.id} />
						</Tabs.Content>

						<Tabs.Content value="linked">
							<div class="md:hidden">
								<LinkedRecordsTab
									contactId={detail.contact.id}
									counts={detail.counts}
									referralCount={detail.referral_count}
								/>
							</div>
						</Tabs.Content>
					</Tabs.Root>
				</div>

				<!-- Desktop right sidebar — hidden on mobile -->
				<aside class="hidden w-72 shrink-0 space-y-4 md:block lg:w-80">
					<!-- Quick Actions card -->
					<div class="rounded-xl border border-border/60 bg-card p-4 shadow-card">
						<p class="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
							Quick Actions
						</p>
						<ContactQuickActions
							contactId={detail.contact.id}
							contactName={detail.contact.full_name}
							phone={detail.contact.phone}
							status={detail.contact.status}
							nextFollowUpAt={detail.contact.next_follow_up_at}
							onAddNote={openAddNote}
							onUpdated={applyOptimisticPatch}
						/>
					</div>

					<!-- Activity card -->
					<div class="rounded-xl border border-border/60 bg-card shadow-card">
						<div class="border-b border-border/50 px-4 py-3">
							<p class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
								Activity
							</p>
						</div>
						<dl class="divide-y divide-border/40">
							<div class="flex items-center justify-between px-4 py-2.5">
								<dt class="flex items-center gap-2 text-xs text-muted-foreground">
									<Clock class="h-3.5 w-3.5 shrink-0" />
									Last contact
								</dt>
								<dd class="text-xs font-medium text-foreground">
									{detail.contact.last_contacted_at
										? formatDateTime(detail.contact.last_contacted_at)
										: '—'}
								</dd>
							</div>
							<div class="flex items-center justify-between px-4 py-2.5">
								<dt class="flex items-center gap-2 text-xs text-muted-foreground">
									<CalendarClock
										class={cn('h-3.5 w-3.5 shrink-0', followUpOverdue && 'text-orange-500')}
									/>
									Follow-up
								</dt>
								<dd
									class={cn(
										'text-xs font-medium',
										followUpOverdue ? 'text-orange-600 dark:text-orange-400' : 'text-foreground'
									)}
								>
									{detail.contact.next_follow_up_at
										? formatDateTime(detail.contact.next_follow_up_at)
										: '—'}
								</dd>
							</div>
							<div class="flex items-center justify-between px-4 py-2.5">
								<dt class="flex items-center gap-2 text-xs text-muted-foreground">
									<CheckCircle2 class="h-3.5 w-3.5 shrink-0" />
									Converted
								</dt>
								<dd class="text-xs font-medium text-foreground">
									{detail.contact.converted_at ? formatDateTime(detail.contact.converted_at) : '—'}
								</dd>
							</div>
							<div class="flex items-center justify-between px-4 py-2.5">
								<dt class="flex items-center gap-2 text-xs text-muted-foreground">
									<MessageSquare class="h-3.5 w-3.5 shrink-0" />
									Preferred
								</dt>
								<dd class="text-xs font-medium text-foreground">{methodLabel ?? '—'}</dd>
							</div>
						</dl>
					</div>

					<!-- Linked Records card -->
					<div class="rounded-xl border border-border/60 bg-card shadow-card">
						<div class="border-b border-border/50 px-4 py-3">
							<p class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
								Linked Records
							</p>
						</div>
						<ul class="divide-y divide-border/40">
							{#each sidebarRecords as row (row.label)}
								<li>
									<a
										href={row.href}
										class="flex items-center justify-between px-4 py-2.5 transition-colors duration-150 hover:bg-accent/50"
									>
										<span class="flex items-center gap-2 text-sm text-foreground">
											<row.icon class="h-3.5 w-3.5 text-muted-foreground" />
											{row.label}
										</span>
										<span class="flex items-center gap-1">
											<span
												class={cn(
													'text-xs font-semibold tabular-nums',
													row.count > 0 ? 'text-primary' : 'text-muted-foreground'
												)}
											>
												{row.count}
											</span>
											{#if row.count > 0}
												<ChevronRight class="h-3.5 w-3.5 text-muted-foreground" />
											{/if}
										</span>
									</a>
								</li>
							{/each}
						</ul>
					</div>
				</aside>
			</div>
		</div>
	{/if}
</PageWrapper>

{#if detail}
	<MergeContactDialog
		bind:open={mergeOpen}
		current={{
			id: detail.contact.id,
			full_name: detail.contact.full_name,
			phone: detail.contact.phone
		}}
		{onMerged}
	/>
{/if}

{#if detail}
	<DeleteContactDialog
		bind:open={confirmDeleteOpen}
		full_name={detail.contact.full_name}
		counts={detail.counts}
		onConfirm={performDelete}
	/>
{/if}
