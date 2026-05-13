<script lang="ts">
	import { dndzone, type DndEvent } from 'svelte-dnd-action';
	import { flip } from 'svelte/animate';
	import OpportunityCard from './OpportunityCard.svelte';
	import { formatCurrency } from '$lib/utils/format';
	import type { OpportunityRow } from '$lib/types/pipeline';

	type Props = {
		stageId: string;
		stageName: string;
		stageColor: string;
		isWon: boolean;
		isLost: boolean;
		items: OpportunityRow[];
		canDrag: boolean;
		onConsider: (e: CustomEvent<DndEvent<OpportunityRow>>) => void;
		onFinalize: (e: CustomEvent<DndEvent<OpportunityRow>>) => void;
		onCardClick: (id: string) => void;
	};

	let {
		stageId,
		stageName,
		stageColor,
		isWon,
		isLost,
		items,
		canDrag,
		onConsider,
		onFinalize,
		onCardClick
	}: Props = $props();

	const totalValue = $derived(
		items.reduce((sum, o) => sum + (o.value ? parseFloat(o.value) : 0), 0)
	);

	const flipDuration = 180;
</script>

<section
	class="flex h-full w-[280px] shrink-0 snap-start flex-col rounded-2xl border border-border bg-muted/40 sm:w-[300px]"
	data-stage-id={stageId}
>
	<header class="flex items-center justify-between gap-2 border-b border-border px-3 py-3">
		<div class="flex items-center gap-2 min-w-0">
			<span
				class="h-2.5 w-2.5 shrink-0 rounded-full"
				style:background-color={stageColor}
				aria-hidden="true"
			></span>
			<h2 class="truncate text-sm font-semibold text-foreground">
				{stageName}
				{#if isWon}<span class="ml-1 text-emerald-600">●</span>{/if}
				{#if isLost}<span class="ml-1 text-rose-600">●</span>{/if}
			</h2>
			<span
				class="rounded-full bg-background px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground"
			>
				{items.length}
			</span>
		</div>
		<span class="text-xs font-semibold tabular-nums text-muted-foreground">
			{formatCurrency(totalValue)}
		</span>
	</header>

	<div
		class="flex-1 space-y-2 overflow-y-auto p-2"
		use:dndzone={{
			items,
			type: 'opportunity',
			dropTargetStyle: {},
			dropTargetClasses: ['ring-2', 'ring-primary/40', 'rounded-2xl'],
			dragDisabled: !canDrag,
			flipDurationMs: flipDuration
		}}
		onconsider={onConsider}
		onfinalize={onFinalize}
	>
		{#each items as opp (opp.id)}
			<div animate:flip={{ duration: flipDuration }}>
				<button
					type="button"
					class="block w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-xl"
					onclick={() => onCardClick(opp.id)}
				>
					<OpportunityCard
						title={opp.title}
						contact_name={opp.contact_name}
						value={opp.value}
						assignee_name={opp.assignee_name}
					/>
				</button>
			</div>
		{/each}
		{#if items.length === 0}
			<div class="flex h-24 items-center justify-center text-xs text-muted-foreground">
				No opportunities
			</div>
		{/if}
	</div>
</section>
