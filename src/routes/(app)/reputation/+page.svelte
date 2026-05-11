<script lang="ts">
	import PageWrapper from '$lib/components/shared/PageWrapper.svelte';
	import SkeletonLoader from '$lib/components/shared/SkeletonLoader.svelte';
</script>

<svelte:head><title>Reputation</title></svelte:head>

<PageWrapper title="Reputation">
	<SkeletonLoader lines={6} label="Loading reviews" />
</PageWrapper>
