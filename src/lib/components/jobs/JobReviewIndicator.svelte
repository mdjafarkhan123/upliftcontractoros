<script lang="ts">
	import Badge from '$lib/components/shared/Badge.svelte';
	import type { ReviewRequestStatus } from '$lib/types/jobs';

	let { status }: { status: ReviewRequestStatus | null } = $props();

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
</script>

<Badge {variant} {label} />
