<script lang="ts">
	import PageWrapper from '$lib/components/shared/PageWrapper.svelte';
	import JobFormBuilder from '$lib/components/settings/JobFormBuilder.svelte';
</script>

<svelte:head><title>New Job Form — Settings</title></svelte:head>

<PageWrapper
	title="New Job Form"
	subtitle="Build a reusable checklist or inspection form"
	back="/settings/job-forms"
>
	<JobFormBuilder />
</PageWrapper>
