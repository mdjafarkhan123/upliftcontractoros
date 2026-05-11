<script lang="ts">
	import PageWrapper from '$lib/components/shared/PageWrapper.svelte';
	import SkeletonLoader from '$lib/components/shared/SkeletonLoader.svelte';
</script>

<svelte:head><title>Settings</title></svelte:head>

<PageWrapper title="Settings">
	<SkeletonLoader lines={6} label="Loading settings" />
</PageWrapper>
