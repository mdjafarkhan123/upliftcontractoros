<script lang="ts">
	import PageWrapper from '$lib/components/shared/PageWrapper.svelte';
	import SkeletonLoader from '$lib/components/shared/SkeletonLoader.svelte';
</script>

<svelte:head><title>Contacts</title></svelte:head>

<PageWrapper title="Contacts">
	<SkeletonLoader lines={6} label="Loading contacts" />
</PageWrapper>
