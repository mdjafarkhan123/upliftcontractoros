<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import * as Tabs from '$lib/components/ui/tabs';
	import PageWrapper from '$lib/components/shared/PageWrapper.svelte';
	import SkeletonLoader from '$lib/components/shared/SkeletonLoader.svelte';
	import EmptyState from '$lib/components/shared/EmptyState.svelte';
	import ConfirmDialog from '$lib/components/shared/ConfirmDialog.svelte';
	import ContactDetailHeader from '$lib/components/contacts/ContactDetailHeader.svelte';
	import ContactOperationalPanel from '$lib/components/contacts/ContactOperationalPanel.svelte';
	import SmsOptOutBanner from '$lib/components/contacts/SmsOptOutBanner.svelte';
	import TimelineTab from '$lib/components/contacts/TimelineTab.svelte';
	import NotesTab from '$lib/components/contacts/NotesTab.svelte';
	import AddressesTab from '$lib/components/contacts/AddressesTab.svelte';
	import LinkedRecordsTab from '$lib/components/contacts/LinkedRecordsTab.svelte';
	import { getMemberContext } from '$lib/context/member';
	import type { ContactDetailResponse } from './+page';

	let { data }: { data: { id: string } } = $props();

	const member = getMemberContext();

	let detail = $state<ContactDetailResponse | null>(null);
	let loading = $state(true);
	let errorMsg = $state<string | null>(null);

	let activeTab = $state<'timeline' | 'notes' | 'addresses' | 'linked'>('timeline');
	let assigneeName = $state<string | null>(null);

	let bindableNotes = $state<ContactDetailResponse['notes']>([]);
	let bindableAddresses = $state<ContactDetailResponse['addresses']>([]);

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

			const assignedTo = body.contact.assigned_to;
			if (assignedTo) {
				try {
					const aRes = await fetch('/api/contacts/assignees');
					if (aRes.ok) {
						const aBody = (await aRes.json()) as {
							assignees: { id: string; full_name: string }[];
						};
						assigneeName =
							aBody.assignees.find((a) => a.id === assignedTo)?.full_name ?? null;
					}
				} catch {
					// ignore — non-critical
				}
			}
		} catch {
			errorMsg = 'Failed to load contact.';
		} finally {
			loading = false;
		}
	});

	const canEdit = $derived(member().can_edit_contacts);
	const canDelete = $derived(member().can_delete_contacts);

	let confirmDeleteOpen = $state(false);
	let deleting = $state(false);
	let deleteError = $state<string | null>(null);
	let deleteBlockCounts = $state<null | {
		opportunities: number;
		jobs: number;
		quotes: number;
		invoices: number;
		conversations: number;
	}>(null);

	async function performDelete() {
		if (!detail) return;
		deleting = true;
		deleteError = null;
		try {
			const res = await fetch(`/api/contacts/${detail.contact.id}`, { method: 'DELETE' });
			if (res.ok) {
				goto('/contacts');
				return;
			}
			const body = await res.json().catch(() => ({}));
			if (res.status === 409 && body.code === 'CONTACT_HAS_LINKS') {
				deleteBlockCounts = body.counts;
				deleteError = 'This contact has linked records and cannot be deleted.';
			} else {
				deleteError = body.error ?? 'Failed to delete contact.';
			}
		} finally {
			deleting = false;
		}
	}
</script>

<svelte:head><title>{detail?.contact.full_name ?? 'Contact'}</title></svelte:head>

<PageWrapper>
	{#if loading}
		<SkeletonLoader lines={6} height="60px" label="Loading contact" />
	{:else if errorMsg || !detail}
		<EmptyState title="Couldn't load contact" description={errorMsg ?? 'Unknown error.'} />
	{:else}
		<div class="space-y-5">
			<ContactDetailHeader
				full_name={detail.contact.full_name}
				phone={detail.contact.phone}
				email={detail.contact.email}
				status={detail.contact.status}
				assignee_name={assigneeName}
				{canEdit}
				{canDelete}
				onBack={() => {
					if (page.url.search) goto('/contacts');
					else history.back();
				}}
				onEdit={() => goto(`/contacts/${detail!.contact.id}/edit`)}
				onDelete={() => {
					deleteError = null;
					deleteBlockCounts = null;
					confirmDeleteOpen = true;
				}}
			/>

			{#if detail.contact.sms_opt_out}
				<SmsOptOutBanner
					source={detail.contact.sms_opt_out_source}
					opted_out_at={detail.contact.sms_opt_out_at}
				/>
			{/if}

			<ContactOperationalPanel
				last_contacted_at={detail.contact.last_contacted_at}
				next_follow_up_at={detail.contact.next_follow_up_at}
				converted_at={detail.contact.converted_at}
				preferred_contact_method={detail.contact.preferred_contact_method}
			/>

			<Tabs.Root bind:value={activeTab}>
				<Tabs.List>
					<Tabs.Trigger value="timeline">Timeline</Tabs.Trigger>
					<Tabs.Trigger value="notes">Notes</Tabs.Trigger>
					<Tabs.Trigger value="addresses">Addresses</Tabs.Trigger>
					<Tabs.Trigger value="linked">Linked</Tabs.Trigger>
				</Tabs.List>

				<Tabs.Content value="timeline">
					<TimelineTab contactId={detail.contact.id} />
				</Tabs.Content>

				<Tabs.Content value="notes">
					<NotesTab contactId={detail.contact.id} bind:notes={bindableNotes} {canEdit} />
				</Tabs.Content>

				<Tabs.Content value="addresses">
					<AddressesTab
						contactId={detail.contact.id}
						bind:addresses={bindableAddresses}
						{canEdit}
					/>
				</Tabs.Content>

				<Tabs.Content value="linked">
					<LinkedRecordsTab contactId={detail.contact.id} counts={detail.counts} />
				</Tabs.Content>
			</Tabs.Root>
		</div>
	{/if}
</PageWrapper>

<ConfirmDialog
	bind:open={confirmDeleteOpen}
	title="Delete this contact?"
	description="This soft-deletes the contact. Phone number stays reserved unless an Admin releases it."
	confirmLabel="Delete"
	variant="destructive"
	loading={deleting}
	onConfirm={performDelete}
/>

{#if deleteError}
	<div
		class="fixed inset-x-4 bottom-24 z-40 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive shadow-lg md:left-auto md:right-8 md:max-w-md"
	>
		<p class="font-medium">{deleteError}</p>
		{#if deleteBlockCounts}
			<ul class="mt-2 grid grid-cols-2 gap-x-4 text-xs">
				<li>Opportunities: {deleteBlockCounts.opportunities}</li>
				<li>Jobs: {deleteBlockCounts.jobs}</li>
				<li>Quotes: {deleteBlockCounts.quotes}</li>
				<li>Invoices: {deleteBlockCounts.invoices}</li>
				<li>Conversations: {deleteBlockCounts.conversations}</li>
			</ul>
		{/if}
		<button
			type="button"
			class="mt-2 text-xs font-medium underline"
			onclick={() => {
				deleteError = null;
				deleteBlockCounts = null;
			}}
		>
			Dismiss
		</button>
	</div>
{/if}
