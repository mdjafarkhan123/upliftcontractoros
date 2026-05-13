<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import type { PageData } from './$types';
	import PageWrapper from '$lib/components/shared/PageWrapper.svelte';
	import SkeletonLoader from '$lib/components/shared/SkeletonLoader.svelte';
	import EmptyState from '$lib/components/shared/EmptyState.svelte';
	import OpportunityDetailSheet from '$lib/components/pipeline/OpportunityDetailSheet.svelte';
	import { Button } from '$lib/components/ui/button';
	import { getMemberContext } from '$lib/context/member';
	import { ArrowLeft } from '@lucide/svelte';
	import type { OpportunityDetail, PipelineStageRow } from '$lib/types/pipeline';

	let { data }: { data: PageData } = $props();

	const member = getMemberContext();
	const canMove = $derived(member().can_move_pipeline_stages);

	let detail = $state<OpportunityDetail | null>(null);
	let stages = $state<PipelineStageRow[]>([]);
	let assignees = $state<{ id: string; full_name: string }[]>([]);
	let loading = $state(true);
	let errorMsg = $state<string | null>(null);
	let open = $state(false);

	onMount(async () => {
		try {
			const [oppRes, stagesRes, assigneesRes] = await Promise.all([
				fetch(`/api/pipeline/opportunities/${data.id}`),
				fetch('/api/pipeline/stages'),
				fetch('/api/contacts/assignees')
			]);
			if (oppRes.status === 404) {
				errorMsg = 'Opportunity not found.';
				return;
			}
			if (!oppRes.ok || !stagesRes.ok) {
				errorMsg = 'Failed to load opportunity.';
				return;
			}
			const oppBody = (await oppRes.json()) as { opportunity: OpportunityDetail };
			const stagesBody = (await stagesRes.json()) as { stages: PipelineStageRow[] };
			detail = oppBody.opportunity;
			stages = stagesBody.stages;
			if (assigneesRes.ok) {
				const a = (await assigneesRes.json()) as {
					assignees: { id: string; full_name: string }[];
				};
				assignees = a.assignees;
			}
			open = true;
		} catch {
			errorMsg = 'Failed to load opportunity.';
		} finally {
			loading = false;
		}
	});

	function close() {
		open = false;
		goto('/pipeline');
	}

	function onChanged(next: OpportunityDetail) {
		detail = next;
	}
</script>

<svelte:head><title>Opportunity</title></svelte:head>

<PageWrapper>
	<Button variant="ghost" href="/pipeline" class="mb-4">
		<ArrowLeft class="h-4 w-4" /> Back to pipeline
	</Button>

	{#if loading}
		<SkeletonLoader lines={6} height="80px" label="Loading opportunity" />
	{:else if errorMsg}
		<EmptyState title="Couldn't load opportunity" description={errorMsg} />
	{/if}
</PageWrapper>

{#if detail}
	<OpportunityDetailSheet
		bind:open
		opportunity={detail}
		{stages}
		{assignees}
		canEdit={canMove}
		onClose={close}
		{onChanged}
	/>
{/if}
