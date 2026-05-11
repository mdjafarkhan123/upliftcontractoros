<script lang="ts">
	import PageWrapper from '$lib/components/shared/PageWrapper.svelte';
	import SkeletonLoader from '$lib/components/shared/SkeletonLoader.svelte';
</script>

<svelte:head><title>Pipeline</title></svelte:head>

<PageWrapper title="Pipeline">
	<SkeletonLoader lines={6} label="Loading pipeline" />
</PageWrapper>
