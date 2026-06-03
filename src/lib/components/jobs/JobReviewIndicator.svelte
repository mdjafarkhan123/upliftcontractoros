<script lang="ts">
	import Badge from '$lib/components/shared/Badge.svelte';
	import { Send, RotateCcw } from '@lucide/svelte';
	import { toast } from '$lib/stores/toast.svelte';
	import { getMemberContext } from '$lib/context/member';
	import type { JobStatus, ReviewRequestStatus } from '$lib/types/jobs';

	let {
		jobId,
		jobStatus,
		status,
		onSent
	}: {
		jobId: string;
		jobStatus: JobStatus;
		status: ReviewRequestStatus | null;
		onSent?: (next: ReviewRequestStatus) => void;
	} = $props();

	const member = getMemberContext();
	const canSend = $derived(member().can_send_review_requests);

	const label = $derived(
		status === 'responded'
			? 'Responded'
			: status === 'sent'
				? 'Sent'
				: status === 'failed'
					? 'Failed'
					: status === 'no_response'
						? 'No response'
						: status === 'pending'
							? 'Queued'
							: 'Not triggered'
	);

	const variant = $derived(
		status === 'responded'
			? 'success'
			: status === 'sent' || status === 'pending'
				? 'info'
				: status === 'failed'
					? 'danger'
					: 'default'
	);

	const canTrigger = $derived(
		canSend &&
			jobStatus === 'completed' &&
			(status === null || status === 'failed' || status === 'no_response')
	);

	const isResend = $derived(status === 'failed' || status === 'no_response');

	let sending = $state(false);

	async function send() {
		if (sending || !canTrigger) return;
		sending = true;
		try {
			const res = await fetch(`/api/jobs/${jobId}/review-request`, { method: 'POST' });
			const body = await res.json();
			if (!res.ok) {
				toast.error(body.error ?? 'Could not send review request.');
				return;
			}
			toast.success('Review request sent.');
			onSent?.('sent');
		} catch {
			toast.error('Network error. Try again.');
		} finally {
			sending = false;
		}
	}
</script>

<div class="flex items-center gap-2">
	<Badge {variant} {label} />
	{#if canTrigger}
		<button
			type="button"
			onclick={send}
			disabled={sending}
			class="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-background px-2 text-xs font-medium text-foreground transition-colors hover:bg-accent active:bg-accent/80 disabled:cursor-not-allowed disabled:opacity-50"
		>
			{#if isResend}
				<RotateCcw class="h-3 w-3" />
				{sending ? 'Sending…' : 'Resend'}
			{:else}
				<Send class="h-3 w-3" />
				{sending ? 'Sending…' : 'Send'}
			{/if}
		</button>
	{/if}
</div>
