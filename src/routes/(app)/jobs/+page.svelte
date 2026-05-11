<script lang="ts">
	import PageWrapper from '$lib/components/shared/PageWrapper.svelte';
	import SkeletonLoader from '$lib/components/shared/SkeletonLoader.svelte';
</script>

<svelte:head><title>Jobs</title></svelte:head>

<PageWrapper title="Jobs">
	<SkeletonLoader lines={6} label="Loading jobs" />
</PageWrapper>
