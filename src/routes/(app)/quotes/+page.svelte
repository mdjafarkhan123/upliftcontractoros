<script lang="ts">
	import PageWrapper from '$lib/components/shared/PageWrapper.svelte';
	import SkeletonLoader from '$lib/components/shared/SkeletonLoader.svelte';
</script>

<svelte:head><title>Quotes</title></svelte:head>

<PageWrapper title="Quotes">
	<SkeletonLoader lines={6} label="Loading quotes" />
</PageWrapper>
