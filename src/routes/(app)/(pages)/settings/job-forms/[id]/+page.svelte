<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import PageWrapper from '$lib/components/shared/PageWrapper.svelte';
	import SkeletonLoader from '$lib/components/shared/SkeletonLoader.svelte';
	import EmptyState from '$lib/components/shared/EmptyState.svelte';
	import JobFormBuilder from '$lib/components/settings/JobFormBuilder.svelte';
	import { toast } from '$lib/stores/toast.svelte';

	type Field = {
		id: string;
		field_type: string;
		label: string;
		help_text: string | null;
		required: boolean;
		options: string[] | null;
	};
	type Template = {
		id: string;
		name: string;
		description: string | null;
		fields: Field[];
	};

	let template = $state<Template | null>(null);
	let loading = $state(true);
	let notFound = $state(false);

	onMount(async () => {
		try {
			const res = await fetch(`/api/job-form-templates/${page.params.id}`);
			if (res.status === 404) {
				notFound = true;
				return;
			}
			if (!res.ok) {
				toast.error('Could not load this form.');
				return;
			}
			const body = (await res.json()) as { data: { template: Template } };
			template = body.data.template;
		} finally {
			loading = false;
		}
	});
</script>

<svelte:head><title>Edit Job Form — Settings</title></svelte:head>

<PageWrapper title="Edit Job Form" subtitle="Update fields and details" back="/settings/job-forms">
	{#if loading}
		<SkeletonLoader lines={4} height="64px" label="Loading form" />
	{:else if notFound || !template}
		<EmptyState
			iconClass="ri-error-warning-line"
			title="Form not found"
			description="This form may have been deleted."
		/>
	{:else}
		<JobFormBuilder
			templateId={template.id}
			initialName={template.name}
			initialDescription={template.description ?? ''}
			initialFields={template.fields}
		/>
	{/if}
</PageWrapper>
