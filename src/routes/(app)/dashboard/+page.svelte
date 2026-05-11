<script lang="ts">
	import PageWrapper from '$lib/components/shared/PageWrapper.svelte';
	import SkeletonLoader from '$lib/components/shared/SkeletonLoader.svelte';
	import { getOrgContext } from '$lib/context/org';

	const org = getOrgContext();
</script>

<svelte:head>
	<title>Dashboard</title>
</svelte:head>

<PageWrapper title="Dashboard" subtitle={`Welcome back to ${org().name}`}>
	<SkeletonLoader lines={6} label="Loading dashboard" />
</PageWrapper>
