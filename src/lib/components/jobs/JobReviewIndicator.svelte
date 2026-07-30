<script lang="ts">
	import Badge from '$lib/components/shared/Badge.svelte';
	import { toast } from '$lib/stores/toast.svelte';
	import { getMemberContext } from '$lib/context/member';
	import type { JobStatus, ReviewRequestStatus } from '$lib/types/jobs';
	import { Button } from '$lib/components/ui/button';

	let {
		jobStatus,
		completedAt = null,
		status,
		onTrigger
	}: {
		jobStatus: JobStatus;
		// Set when the job was closed as complete (archived + completed_at). A cancelled job is also
		// archived but has no completed_at — it must never offer a review request.
		completedAt?: string | null;
		status: ReviewRequestStatus | null;
		onTrigger?: () => void | Promise<void>;
	} = $props();

	const member = getMemberContext();
	const canSend = $derived(member().can_send_review_requests);

	const label = $derived(
		status === 'scheduled'
			? 'Queued'
			: status === 'sent'
				? 'Sent'
				: status === 'engaged'
					? 'Opened'
					: status === 'likely_reviewed'
						? 'Likely reviewed'
						: status === 'completed_internal'
							? 'Internal feedback'
							: status === 'expired'
								? 'Expired'
								: 'Not requested'
	);

	const variant = $derived(
		status === 'likely_reviewed'
			? 'success'
			: status === 'sent' || status === 'scheduled' || status === 'engaged'
				? 'info'
				: status === 'completed_internal'
					? 'warning'
					: status === 'expired'
						? 'danger'
						: 'default'
	);

	const canTrigger = $derived(
		canSend && jobStatus === 'archived' && !!completedAt && status === null && !!onTrigger
	);

	let sending = $state(false);

	async function send() {
		if (sending || !canTrigger) return;
		sending = true;
		try {
			await onTrigger?.();
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
			<i class="ri-send-plane-line" aria-hidden="true"></i>
			Send
		</Button>
	{/if}
</div>
