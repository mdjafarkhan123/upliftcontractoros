<script lang="ts">
	import Badge from '$lib/components/shared/Badge.svelte';
	import type { AppointmentStatus } from '$lib/types/appointments';

	let { status, class: className }: { status: AppointmentStatus; class?: string } = $props();

	const variant = $derived(
		status === 'completed'
			? 'success'
			: status === 'cancelled'
				? 'danger'
				: status === 'no_show'
					? 'danger'
					: 'warning'
	);
	const label = $derived(
		status === 'no_show' ? 'No-show' : status[0].toUpperCase() + status.slice(1)
	);
</script>

<Badge {variant} {label} class={className} />
