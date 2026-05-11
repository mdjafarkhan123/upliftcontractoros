<script lang="ts">
	import PageWrapper from '$lib/components/shared/PageWrapper.svelte';
	import SkeletonLoader from '$lib/components/shared/SkeletonLoader.svelte';
</script>

<svelte:head><title>Appointments</title></svelte:head>

<PageWrapper title="Appointments">
	<SkeletonLoader lines={6} label="Loading appointments" />
</PageWrapper>
