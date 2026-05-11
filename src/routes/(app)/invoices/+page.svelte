<script lang="ts">
	import PageWrapper from '$lib/components/shared/PageWrapper.svelte';
	import SkeletonLoader from '$lib/components/shared/SkeletonLoader.svelte';
</script>

<svelte:head><title>Invoices</title></svelte:head>

<PageWrapper title="Invoices">
	<SkeletonLoader lines={6} label="Loading invoices" />
</PageWrapper>
