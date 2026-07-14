<script lang="ts">
	import Badge from '$lib/components/shared/Badge.svelte';
	import { toast } from '$lib/stores/toast.svelte';
	import { getMemberContext } from '$lib/context/member';
	import type { JobStatus, ReviewRequestStatus } from '$lib/types/jobs';
	import { Button } from '$lib/components/ui/button';

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

<div class="job-review">
	<Badge {variant} {label} />
	{#if canTrigger}
		<Button variant="secondary" size="sm" loading={sending} onclick={send}>
			<i class={isResend ? 'ri-refresh-line' : 'ri-send-plane-line'} aria-hidden="true"></i>
			{isResend ? 'Resend' : 'Send'}
		</Button>
	{/if}
</div>
