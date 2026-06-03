<script lang="ts">
	import Badge from '$lib/components/shared/Badge.svelte';
	import type { JobStatus } from '$lib/types/jobs';

	let { status, class: className }: { status: JobStatus; class?: string } = $props();

	const variant = $derived(
		status === 'completed'
			? 'success'
			: status === 'in_progress'
				? 'info'
				: status === 'cancelled'
					? 'danger'
					: 'warning'
	);
	const label = $derived(
		status === 'in_progress' ? 'In Progress' : status[0].toUpperCase() + status.slice(1)
	);
</script>

<Badge {variant} {label} class={className} />
