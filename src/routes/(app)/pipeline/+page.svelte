<script lang="ts">
	import { onMount } from 'svelte';
	import type { DndEvent } from 'svelte-dnd-action';
	import { SHADOW_ITEM_MARKER_PROPERTY_NAME } from 'svelte-dnd-action';
	import PageWrapper from '$lib/components/shared/PageWrapper.svelte';
	import EmptyState from '$lib/components/shared/EmptyState.svelte';
	import SkeletonLoader from '$lib/components/shared/SkeletonLoader.svelte';
	import { Button } from '$lib/components/ui/button';
	import PipelineColumn from '$lib/components/pipeline/PipelineColumn.svelte';
	import NewOpportunitySheet from '$lib/components/pipeline/NewOpportunitySheet.svelte';
	import OpportunityDetailSheet from '$lib/components/pipeline/OpportunityDetailSheet.svelte';
	import LostReasonDialog from '$lib/components/pipeline/LostReasonDialog.svelte';
	import ConfirmDialog from '$lib/components/shared/ConfirmDialog.svelte';
	import { getMemberContext } from '$lib/context/member';
	import { GitBranch, Plus } from '@lucide/svelte';
	import type { OpportunityRow, OpportunityDetail } from '$lib/types/pipeline';
	import { pipelineStore } from '$lib/stores/pipeline.svelte';

	const member = getMemberContext();
	const canCreate = $derived(member().can_create_opportunities);
	const canMove = $derived(member().can_move_pipeline_stages);

	const stages = $derived(pipelineStore.stages);
	const opportunities = $derived(pipelineStore.opportunities);
	const assignees = $derived(pipelineStore.assignees);
	const loading = $derived(
		pipelineStore.status === 'loading' || pipelineStore.status === 'idle'
	);
	const errorMsg = $derived(
		pipelineStore.status === 'error' ? pipelineStore.error : null
	);

	onMount(() => {
		void pipelineStore.load();
	});

	let createOpen = $state(false);
	let detailOpen = $state(false);
	let detail = $state<OpportunityDetail | null>(null);

	let pendingWonOpen = $state(false);
	let pendingLostOpen = $state(false);
	let pendingMove = $state<{ id: string; from: string } | null>(null);
	let actionLoading = $state(false);

	const grouped = $derived.by(() => {
		const m = new Map<string, OpportunityRow[]>();
		for (const s of stages) m.set(s.id, []);
		for (const o of opportunities) {
			const list = m.get(o.stage_id);
			if (list) list.push(o);
		}
		return m;
	});

	function applyStage(id: string, toStageId: string) {
		pipelineStore.applyStage(id, toStageId);
	}

	function findStage(id: string) {
		return stages.find((s) => s.id === id);
	}

	function handleConsider(stageId: string) {
		return (e: CustomEvent<DndEvent<OpportunityRow>>) => {
			const incoming = e.detail.items;
			// Drop items now in this column from elsewhere; replace this column's items with incoming
			const others = opportunities.filter(
				(o) => o.stage_id !== stageId && !incoming.some((i) => i.id === o.id)
			);
			const repl = incoming.map((i) => ({ ...i, stage_id: stageId }));
			pipelineStore.setOpportunities([...others, ...repl]);
		};
	}

	function handleFinalize(stageId: string) {
		return async (e: CustomEvent<DndEvent<OpportunityRow>>) => {
			const cleanItems = e.detail.items.map((it) => {
				const copy = { ...it } as Record<string, unknown>;
				delete copy[SHADOW_ITEM_MARKER_PROPERTY_NAME];
				return copy as OpportunityRow;
			});

			// Find the moved item (whose stage_id in cleanItems differs from current)
			let movedId: string | null = null;
			let originalStage: string | null = null;
			for (const it of cleanItems) {
				const cur = opportunities.find((o) => o.id === it.id);
				if (cur && cur.stage_id !== stageId) {
					movedId = it.id;
					originalStage = cur.stage_id;
					break;
				}
			}

			// Apply the new layout for this column
			const others = opportunities.filter(
				(o) => o.stage_id !== stageId && !cleanItems.some((c) => c.id === o.id)
			);
			const updatedColumn = cleanItems.map((it) => ({ ...it, stage_id: stageId }));
			pipelineStore.setOpportunities([...others, ...updatedColumn]);

			if (!movedId || !originalStage) return; // reorder within same column

			const target = findStage(stageId);
			if (!target) return;

			if (target.is_won) {
				pendingMove = { id: movedId, from: originalStage };
				pendingWonOpen = true;
				return;
			}
			if (target.is_lost) {
				pendingMove = { id: movedId, from: originalStage };
				pendingLostOpen = true;
				return;
			}

			try {
				const res = await fetch(`/api/pipeline/opportunities/${movedId}/stage`, {
					method: 'PATCH',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ stage_id: stageId })
				});
				if (!res.ok) applyStage(movedId, originalStage);
			} catch {
				applyStage(movedId, originalStage);
			}
		};
	}

	async function commitMove(stage_id: string, lost_reason?: string) {
		if (!pendingMove) return;
		actionLoading = true;
		try {
			const res = await fetch(`/api/pipeline/opportunities/${pendingMove.id}/stage`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ stage_id, lost_reason })
			});
			if (!res.ok) {
				applyStage(pendingMove.id, pendingMove.from);
			} else {
				const body = (await res.json()) as { opportunity: OpportunityRow };
				pipelineStore.update({ ...body.opportunity, id: pendingMove.id });
			}
		} catch {
			applyStage(pendingMove.id, pendingMove.from);
		} finally {
			actionLoading = false;
			pendingMove = null;
			pendingWonOpen = false;
			pendingLostOpen = false;
		}
	}

	function cancelPending() {
		if (pendingMove) applyStage(pendingMove.id, pendingMove.from);
		pendingMove = null;
		pendingWonOpen = false;
		pendingLostOpen = false;
	}

	async function openDetail(id: string) {
		const res = await fetch(`/api/pipeline/opportunities/${id}`);
		if (!res.ok) return;
		const body = (await res.json()) as { opportunity: OpportunityDetail };
		detail = body.opportunity;
		detailOpen = true;
	}

	function onDetailChanged(next: OpportunityDetail) {
		detail = next;
		pipelineStore.update(next);
	}

	async function onCreated(id: string) {
		createOpen = false;
		await pipelineStore.refreshOpportunities();
		await openDetail(id);
	}
</script>

<svelte:head><title>Pipeline</title></svelte:head>

<PageWrapper
	title="Pipeline"
	subtitle="Drag opportunities through your stages"
	class="md:max-w-none"
>
	{#snippet actions()}
		{#if canCreate}
			<Button onclick={() => (createOpen = true)}><Plus class="h-4 w-4" /> New</Button>
		{/if}
	{/snippet}

	{#if loading}
		<SkeletonLoader lines={6} height="80px" label="Loading pipeline" />
	{:else if errorMsg}
		<EmptyState icon={GitBranch} title="Couldn't load pipeline" description={errorMsg} />
	{:else if stages.length === 0}
		<EmptyState
			icon={GitBranch}
			title="No pipeline stages"
			description="Your default stages should be created on org setup. Contact support if this persists."
		/>
	{:else}
		<div
			class="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-4 md:mx-0 md:px-0 md:snap-none"
			style="height: calc(100vh - 220px); min-height: 480px;"
		>
			{#each stages as stage (stage.id)}
				<PipelineColumn
					stageId={stage.id}
					stageName={stage.name}
					stageColor={stage.color}
					isWon={stage.is_won}
					isLost={stage.is_lost}
					items={grouped.get(stage.id) ?? []}
					canDrag={canMove}
					onConsider={handleConsider(stage.id)}
					onFinalize={handleFinalize(stage.id)}
					onCardClick={openDetail}
				/>
			{/each}
		</div>
	{/if}
</PageWrapper>

{#if canCreate}
	<NewOpportunitySheet
		bind:open={createOpen}
		{assignees}
		onClose={() => (createOpen = false)}
		{onCreated}
	/>
{/if}

{#if detail}
	<OpportunityDetailSheet
		bind:open={detailOpen}
		opportunity={detail}
		{stages}
		{assignees}
		canEdit={canMove}
		onClose={() => (detailOpen = false)}
		onChanged={onDetailChanged}
	/>
{/if}

<ConfirmDialog
	bind:open={pendingWonOpen}
	title="Mark as won?"
	description="A job will be created automatically and the contact will become a customer."
	confirmLabel="Mark won"
	loading={actionLoading}
	onConfirm={async () => {
		const wonStage = stages.find((s) => s.is_won);
		if (wonStage) await commitMove(wonStage.id);
	}}
/>

<LostReasonDialog
	bind:open={pendingLostOpen}
	loading={actionLoading}
	onCancel={cancelPending}
	onConfirm={async (reason) => {
		const lostStage = stages.find((s) => s.is_lost);
		if (lostStage) await commitMove(lostStage.id, reason);
	}}
/>
