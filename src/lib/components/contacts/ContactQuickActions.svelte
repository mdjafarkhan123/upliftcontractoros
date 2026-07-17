<script lang="ts">
	import { goto } from '$app/navigation';
	import FollowUpPresetPopover from './FollowUpPresetPopover.svelte';
	import { Button } from '$lib/components/ui/button';
	import { getMemberContext } from '$lib/context/member';
	import { toast } from '$lib/stores/toast.svelte';

	let {
		contactId,
		contactName,
		phone,
		status,
		nextFollowUpAt,
		onAddNote,
		onUpdated
	}: {
		contactId: string;
		contactName: string;
		phone: string | null;
		status: 'lead' | 'customer' | 'archived';
		nextFollowUpAt: string | null;
		onAddNote: () => void;
		onUpdated: (patch: { status?: 'customer'; next_follow_up_at?: string | null }) => void;
	} = $props();

	const member = getMemberContext();
	const canEdit = $derived(member().can_edit_contacts);
	const canQuote = $derived(member().can_create_quotes);
	const canAppt = $derived(member().can_create_appointments);

	let converting = $state(false);
	let opening = $state(false);

	async function openConversation() {
		if (opening) return;
		opening = true;
		try {
			const res = await fetch(`/api/conversations/resolve?contact_id=${contactId}`);
			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				toast.error(body.error ?? 'Could not open conversation');
				return;
			}
			const body = (await res.json()) as { data: { conversation_id: string | null } };
			if (body.data.conversation_id) {
				await goto(`/inbox/${body.data.conversation_id}`);
			} else {
				const params = new URLSearchParams({
					contact_id: contactId,
					name: contactName,
					phone: phone ?? ''
				});
				await goto(`/inbox/compose?${params}`);
			}
		} catch {
			toast.error('Could not open conversation');
		} finally {
			opening = false;
		}
	}

	async function convertToCustomer() {
		if (converting) return;
		converting = true;
		try {
			const res = await fetch(`/api/contacts/${contactId}`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ status: 'customer' })
			});
			if (res.ok) {
				onUpdated({ status: 'customer' });
				toast.success('Marked as customer');
			} else {
				const body = await res.json().catch(() => ({}));
				toast.error(body.error ?? 'Failed to convert contact');
			}
		} finally {
			converting = false;
		}
	}
</script>

<section class="contact-quick-actions" aria-label="Quick actions">
	{#if phone}
		<Button variant="secondary" href={`tel:${phone}`}>
			<i class="ri-phone-line" aria-hidden="true"></i> Call
		</Button>
	{/if}

	<Button type="button" variant="secondary" disabled={opening} onclick={openConversation}>
		<i class="ri-message-2-line" aria-hidden="true"></i> Message
	</Button>

	{#if canQuote}
		<Button
			type="button"
			variant="secondary"
			onclick={() => goto(`/quotes/new?contact_id=${contactId}`)}
		>
			<i class="ri-file-text-line" aria-hidden="true"></i> Quote
		</Button>
	{/if}

	{#if canAppt}
		<Button
			type="button"
			variant="secondary"
			onclick={() =>
				goto(
					`/appointments/new?contact_id=${contactId}&contact_name=${encodeURIComponent(contactName)}`
				)}
		>
			<i class="ri-calendar-event-line" aria-hidden="true"></i> Book
		</Button>
	{/if}

	{#if canEdit}
		<Button type="button" variant="secondary" onclick={onAddNote}>
			<i class="ri-sticky-note-line" aria-hidden="true"></i> Note
		</Button>
	{/if}

	{#if canEdit}
		<FollowUpPresetPopover
			{contactId}
			currentValue={nextFollowUpAt}
			onUpdated={(iso) => onUpdated({ next_follow_up_at: iso })}
		/>
	{/if}

	{#if canEdit && status === 'lead'}
		<Button
			type="button"
			variant="default"
			loading={converting}
			loadingLabel="Converting…"
			onclick={convertToCustomer}
		>
			<i class="ri-checkbox-circle-line" aria-hidden="true"></i>
			Convert
		</Button>
	{/if}
</section>
