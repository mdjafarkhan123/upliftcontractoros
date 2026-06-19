<script lang="ts">
	import { goto } from '$app/navigation';
	import type { PageData } from './$types';
	import PageWrapper from '$lib/components/shared/PageWrapper.svelte';
	import SkeletonLoader from '$lib/components/shared/SkeletonLoader.svelte';
	import EmptyState from '$lib/components/shared/EmptyState.svelte';
	import OpportunityDetailSheet from '$lib/components/pipeline/OpportunityDetailSheet.svelte';
	import { Button } from '$lib/components/ui/button';
	import { getMemberContext } from '$lib/context/member';
	import { ArrowLeft } from '@lucide/svelte';
	import { opportunityDetailStore } from '$lib/stores/opportunityDetail.svelte';
	import type { OpportunityDetail, PipelineStageRow } from '$lib/types/pipeline';

	let { data }: { data: PageData } = $props();

	const member = getMemberContext();
	const canMove = $derived(member().can_move_pipeline_stages);

	const id = $derived(data.id);

	// SWR load — instant if the opportunity was prefetched/opened from the board.
	$effect(() => {
		void opportunityDetailStore.load(id);
	});

	const detail = $derived(opportunityDetailStore.get(id));
	const errorMsg = $derived(opportunityDetailStore.getError(id));
	const loadingCold = $derived(opportunityDetailStore.isLoading(id) && !detail);

	// Stages + assignees power the sheet controls; load once, lazily.
	let stages = $state<PipelineStageRow[]>([]);
	let assignees = $state<{ id: string; full_name: string }[]>([]);
	let supportLoaded = $state(false);
	$effect(() => {
		if (supportLoaded) return;
		supportLoaded = true;
		void (async () => {
			const [stagesRes, assigneesRes] = await Promise.all([
				fetch('/api/pipeline/stages'),
				fetch('/api/contacts/assignees')
			]);
			if (stagesRes.ok)
				stages = ((await stagesRes.json()) as { stages: PipelineStageRow[] }).stages;
			if (assigneesRes.ok) {
				const a = (await assigneesRes.json()) as {
					assignees: { id: string; full_name: string }[];
				};
				assignees = a.assignees;
			}
		})();
	});

	let open = $state(false);
	$effect(() => {
		if (detail) open = true;
	});

	function close() {
		open = false;
		goto('/pipeline');
	}

	function onChanged(next: OpportunityDetail) {
		opportunityDetailStore.set(next.id, next);
	}
</script>

<svelte:head><title>Opportunity</title></svelte:head>

<PageWrapper>
	<Button variant="ghost" href="/pipeline" class="mb-4">
		<ArrowLeft class="h-4 w-4" /> Back to pipeline
	</Button>

	{#if loadingCold}
		<SkeletonLoader lines={6} height="80px" label="Loading opportunity" />
	{:else if errorMsg && !detail}
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
