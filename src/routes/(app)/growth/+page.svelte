<script lang="ts">
	import PageWrapper from '$lib/components/shared/PageWrapper.svelte';
	import SkeletonLoader from '$lib/components/shared/SkeletonLoader.svelte';
</script>

<svelte:head><title>Growth</title></svelte:head>

<PageWrapper title="Growth">
	<SkeletonLoader lines={6} label="Loading growth feed" />
</PageWrapper>
