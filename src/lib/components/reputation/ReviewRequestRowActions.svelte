<script lang="ts">
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import ConfirmDialog from '$lib/components/shared/ConfirmDialog.svelte';
	import { MoreVertical, Send, Bell, Ban } from '@lucide/svelte';
	import { toast } from '$lib/stores/toast.svelte';
	import { reviewRequestsStore, reputationSummaryStore } from '$lib/stores/reputation.svelte';
	import type { ReviewRequestListItem } from '$lib/types/reputation';

	let {
		request,
		displayStatus
	}: {
		request: ReviewRequestListItem;
		displayStatus: ReviewRequestListItem['status'] | 'expired';
	} = $props();

	let confirmCancelOpen = $state(false);
	let cancelLoading = $state(false);
	let actionLoading = $state(false);

	const canResend = $derived(displayStatus === 'sent');
	const canNudge = $derived(displayStatus === 'engaged' && request.nudge_count < 2);
	const canCancel = $derived(
		displayStatus === 'scheduled' || displayStatus === 'sent' || displayStatus === 'engaged'
	);

	// If nothing is actionable (terminal row) the menu shouldn't render at all.
	const hasAnyAction = $derived(canResend || canNudge || canCancel);

	async function resend() {
		if (actionLoading) return;
		actionLoading = true;
		try {
			const res = await fetch(`/api/review-requests/${request.id}/resend`, { method: 'POST' });
			if (res.status === 204) {
				toast.success('Review request resent');
				return;
			}
			const body = (await res.json().catch(() => ({}))) as { error?: string };
			toast.error(body.error ?? 'Failed to resend');
		} catch {
			toast.error('Failed to resend');
		} finally {
			actionLoading = false;
		}
	}

	async function sendNudge() {
		if (actionLoading) return;
		actionLoading = true;
		try {
			const res = await fetch(`/api/review-requests/${request.id}/send-nudge`, {
				method: 'POST'
			});
			if (res.status === 204) {
				toast.success('Nudge sent');
				await reviewRequestsStore.load(true);
				return;
			}
			const body = (await res.json().catch(() => ({}))) as { error?: string };
			toast.error(body.error ?? 'Failed to send nudge');
		} catch {
			toast.error('Failed to send nudge');
		} finally {
			actionLoading = false;
		}
	}

	async function cancel() {
		cancelLoading = true;
		try {
			const res = await fetch(`/api/review-requests/${request.id}`, { method: 'DELETE' });
			if (res.status === 204) {
				toast.success('Review request cancelled');
				await reviewRequestsStore.load(true);
				await reputationSummaryStore.load(true);
				return;
			}
			const body = (await res.json().catch(() => ({}))) as { error?: string };
			toast.error(body.error ?? 'Failed to cancel');
		} catch {
			toast.error('Failed to cancel');
		} finally {
			cancelLoading = false;
		}
	}
</script>

{#if hasAnyAction}
	<DropdownMenu.Root>
		<DropdownMenu.Trigger
			class="inline-flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
			aria-label="Review request actions"
			disabled={actionLoading}
		>
			<MoreVertical class="h-4 w-4" />
		</DropdownMenu.Trigger>
		<DropdownMenu.Content align="end" class="w-52">
			{#if canResend}
				<DropdownMenu.Item onSelect={resend}>
					<Send class="mr-2 h-4 w-4" />
					Resend SMS now
				</DropdownMenu.Item>
			{/if}
			{#if canNudge}
				<DropdownMenu.Item onSelect={sendNudge}>
					<Bell class="mr-2 h-4 w-4" />
					Send nudge #{request.nudge_count + 1} now
				</DropdownMenu.Item>
			{/if}
			{#if canCancel}
				{#if canResend || canNudge}
					<DropdownMenu.Separator />
				{/if}
				<DropdownMenu.Item variant="destructive" onSelect={() => (confirmCancelOpen = true)}>
					<Ban class="mr-2 h-4 w-4" />
					Cancel automation
				</DropdownMenu.Item>
			{/if}
		</DropdownMenu.Content>
	</DropdownMenu.Root>

	<ConfirmDialog
		bind:open={confirmCancelOpen}
		title="Cancel this review request?"
		description="No more reminders or nudges will be sent. This can't be undone, but you can send a fresh request for the same job later."
		confirmLabel="Cancel automation"
		cancelLabel="Keep it"
		variant="destructive"
		loading={cancelLoading}
		onConfirm={cancel}
	/>
{/if}
