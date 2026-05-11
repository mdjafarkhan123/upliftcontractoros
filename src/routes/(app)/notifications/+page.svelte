<script lang="ts">
	import PageWrapper from '$lib/components/shared/PageWrapper.svelte';
	import SkeletonLoader from '$lib/components/shared/SkeletonLoader.svelte';
</script>

<svelte:head><title>Notifications</title></svelte:head>

<PageWrapper title="Notifications">
	<SkeletonLoader lines={6} label="Loading notifications" />
</PageWrapper>
