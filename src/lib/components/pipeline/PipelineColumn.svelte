<script lang="ts">
	import { dndzone, type DndEvent } from 'svelte-dnd-action';
	import { flip } from 'svelte/animate';
	import { Plus } from '@lucide/svelte';
	import OpportunityCard from './OpportunityCard.svelte';
	import { formatCurrency } from '$lib/utils/format';
	import type { OpportunityRow } from '$lib/types/pipeline';

	type Props = {
		stageId: string;
		stageName: string;
		stageColor: string;
		isWon: boolean;
		isLost: boolean;
		staleAfterDays: number | null;
		items: OpportunityRow[];
		canDrag: boolean;
		canAdd?: boolean;
		showStageTotal?: boolean;
		isFiltering?: boolean;
		onConsider: (e: CustomEvent<DndEvent<OpportunityRow>>) => void;
		onFinalize: (e: CustomEvent<DndEvent<OpportunityRow>>) => void;
		onCardClick: (id: string) => void;
		onAdd?: (stageId: string) => void;
	};

	let {
		stageId,
		stageName,
		stageColor,
		isWon,
		isLost,
		staleAfterDays,
		items,
		canDrag,
		canAdd = false,
		showStageTotal = true,
		isFiltering = false,
		onConsider,
		onFinalize,
		onCardClick,
		onAdd
	}: Props = $props();

	const totalValue = $derived(
		items.reduce((sum, o) => sum + (o.value ? parseFloat(o.value) : 0), 0)
	);

	const flipDuration = 180;

	function transformDraggedElement(el?: HTMLElement) {
		if (!el) return;
		el.classList.add('shadow-xl', 'scale-[1.02]', 'opacity-95');
		el.style.willChange = 'transform';
		el.style.transition = 'box-shadow 150ms ease-out, opacity 150ms ease-out';
	}

	function onCardKey(e: KeyboardEvent, id: string) {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			onCardClick(id);
		}
	}
</script>

<section
	class="relative flex h-full w-[280px] shrink-0 snap-start flex-col overflow-hidden rounded-lg border border-border/60 bg-muted/30 shadow-card sm:w-[300px]"
	class:border-l-4={isWon || isLost}
	style:border-left-color={isWon || isLost ? stageColor : undefined}
	data-stage-id={stageId}
>
	<div class="h-[3px] w-full shrink-0" style:background-color={stageColor} aria-hidden="true"></div>

	<header
		class="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-border/60 bg-card px-3 py-2.5"
	>
		<div class="flex min-w-0 items-center gap-2">
			<h2 class="truncate text-sm font-semibold text-foreground">
				{stageName}
			</h2>
			<span
				class="rounded-full bg-background px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-muted-foreground ring-1 ring-border/60"
			>
				{items.length}
			</span>
		</div>
		{#if showStageTotal && items.length > 0}
			<span class="shrink-0 text-xs font-semibold tabular-nums text-muted-foreground">
				{formatCurrency(totalValue)}
			</span>
		{/if}
	</header>

	<div class="relative flex-1 overflow-y-auto" style="touch-action: pan-y;">
		<div
			class="flex min-h-full flex-col gap-2 p-2"
			use:dndzone={{
				items,
				type: 'opportunity',
				dropTargetStyle: {},
				dropTargetClasses: ['ring-2', 'ring-primary/50', 'rounded-md', 'bg-primary/5'],
				dragDisabled: !canDrag,
				flipDurationMs: flipDuration,
				transformDraggedElement
			}}
			onconsider={onConsider}
			onfinalize={onFinalize}
		>
			{#each items as opp (opp.id)}
				<div
					animate:flip={{ duration: flipDuration }}
					role="button"
					tabindex="0"
					aria-label={`${opp.contact_name} — ${opp.title}`}
					class="rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"
					onclick={() => onCardClick(opp.id)}
					onkeydown={(e) => onCardKey(e, opp.id)}
				>
					<OpportunityCard
						title={opp.title}
						contact_name={opp.contact_name}
						value={opp.value}
						assignee_name={opp.assignee_name}
						stage_entered_at={opp.stage_entered_at}
						stale_after_days={staleAfterDays}
					/>
				</div>
			{/each}
		</div>

		{#if items.length === 0}
			<div
				class="pointer-events-none absolute inset-x-2 top-2 flex h-[120px] items-center justify-center"
			>
				<div
					class="flex h-full w-full items-center justify-center rounded-lg border border-dashed border-border/60 bg-muted/40 px-3 text-center text-xs text-muted-foreground"
				>
					{isFiltering ? 'No matches in this stage' : 'Drop or add here'}
				</div>
			</div>
		{/if}
	</div>

	{#if canAdd && !isWon && !isLost && onAdd}
		<button
			type="button"
			class="flex items-center justify-center gap-1.5 border-t border-border/60 bg-muted px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			onclick={() => onAdd?.(stageId)}
		>
			<Plus class="h-3.5 w-3.5" />
			Add opportunity
		</button>
	{/if}
</section>
