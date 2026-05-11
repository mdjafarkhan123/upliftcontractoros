<script lang="ts">
	import PageWrapper from '$lib/components/shared/PageWrapper.svelte';
	import SkeletonLoader from '$lib/components/shared/SkeletonLoader.svelte';
</script>

<svelte:head><title>Profile</title></svelte:head>

<PageWrapper title="Profile">
	<SkeletonLoader lines={6} label="Loading profile" />
</PageWrapper>
