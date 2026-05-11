<script lang="ts">
	import PageWrapper from '$lib/components/shared/PageWrapper.svelte';
	import SkeletonLoader from '$lib/components/shared/SkeletonLoader.svelte';
</script>

<svelte:head><title>Inbox</title></svelte:head>

<PageWrapper title="Inbox">
	<SkeletonLoader lines={6} label="Loading conversations" />
</PageWrapper>
