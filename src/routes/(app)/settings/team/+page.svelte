<script lang="ts">
	import PageWrapper from '$lib/components/shared/PageWrapper.svelte';
	import SkeletonLoader from '$lib/components/shared/SkeletonLoader.svelte';
</script>

<svelte:head><title>Team</title></svelte:head>

<PageWrapper title="Team" subtitle="Manage team members and their permissions">
	<SkeletonLoader lines={6} label="Loading team" />
</PageWrapper>
