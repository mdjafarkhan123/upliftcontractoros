<script lang="ts">
	import { goto } from '$app/navigation';
	import { Button } from '$lib/components/ui/button';
	import FollowUpPresetPopover from './FollowUpPresetPopover.svelte';
	import { getMemberContext } from '$lib/context/member';
	import { toast } from '$lib/stores/toast.svelte';
	import {
		Phone,
		MessageSquare,
		FileText,
		CalendarPlus,
		StickyNote,
		CheckCircle2
	} from '@lucide/svelte';

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
		phone: string;
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
					phone
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

<section
	class="-mx-1 flex snap-x snap-mandatory gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] sm:flex-wrap sm:overflow-visible [&::-webkit-scrollbar]:hidden"
	aria-label="Quick actions"
>
	<Button variant="outline" class="h-11 shrink-0 snap-start" href={`tel:${phone}`}>
		<Phone class="h-4 w-4" /> Call
	</Button>

	<Button
		variant="outline"
		class="h-11 shrink-0 snap-start"
		disabled={opening}
		onclick={openConversation}
	>
		<MessageSquare class="h-4 w-4" /> Message
	</Button>

	{#if canQuote}
		<Button
			variant="outline"
			class="h-11 shrink-0 snap-start"
			onclick={() => goto(`/quotes/new?contact_id=${contactId}`)}
		>
			<FileText class="h-4 w-4" /> Quote
		</Button>
	{/if}

	{#if canAppt}
		<Button
			variant="outline"
			class="h-11 shrink-0 snap-start"
			onclick={() =>
				goto(
					`/appointments/new?contact_id=${contactId}&contact_name=${encodeURIComponent(contactName)}`
				)}
		>
			<CalendarPlus class="h-4 w-4" /> Book
		</Button>
	{/if}

	{#if canEdit}
		<Button variant="outline" class="h-11 shrink-0 snap-start" onclick={onAddNote}>
			<StickyNote class="h-4 w-4" /> Note
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
		<Button class="h-11 shrink-0 snap-start" disabled={converting} onclick={convertToCustomer}>
			<CheckCircle2 class="h-4 w-4" />
			{converting ? 'Converting…' : 'Convert'}
		</Button>
	{/if}
</section>
