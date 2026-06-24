<script lang="ts">
	import type { DndEvent } from 'svelte-dnd-action';
	import { lazyDndzone } from '$lib/actions/lazyDndzone';
	import { flip } from 'svelte/animate';
	import { Plus } from '@lucide/svelte';
	import OpportunityCard from './OpportunityCard.svelte';
	import { formatCurrency } from '$lib/utils/format';
	import type { OpportunityRow } from '$lib/types/pipeline';
	import { prefetchOnIntent } from '$lib/actions/prefetch';
	import { opportunityDetailStore } from '$lib/stores/opportunityDetail.svelte';
	import { cn } from '$lib/utils/cn';

	type Props = {
		stageId: string;
		stageName: string;
		stageColor: string;
		staleAfterDays: number | null;
		items: OpportunityRow[];
		canDrag: boolean;
		canAdd?: boolean;
		canMarkStatus?: boolean;
		showStageTotal?: boolean;
		isFiltering?: boolean;
		ghostLeadDays?: number | null;
		fill?: boolean;
		onConsider: (e: CustomEvent<DndEvent<OpportunityRow>>) => void;
		onFinalize: (e: CustomEvent<DndEvent<OpportunityRow>>) => void;
		onCardClick: (id: string) => void;
		onAdd?: (stageId: string) => void;
		onMarkStatus?: (id: string, status: 'won' | 'lost') => void;
		onQuickFollowUp?: (id: string, preset: 'tomorrow' | 'in3days' | 'clear') => void;
	};

	let {
		stageId,
		stageName,
		stageColor,
		staleAfterDays,
		items,
		canDrag,
		canAdd = false,
		canMarkStatus = false,
		showStageTotal = true,
		isFiltering = false,
		ghostLeadDays = null,
		fill = false,
		onConsider,
		onFinalize,
		onCardClick,
		onAdd,
		onMarkStatus,
		onQuickFollowUp
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
	class={cn(
		'relative flex h-full snap-start flex-col overflow-hidden rounded-lg border border-border/60 bg-muted/30 shadow-card',
		fill
			? 'min-w-[220px] flex-1'
			: 'w-[280px] shrink-0 sm:w-[300px]'
	)}
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
			use:lazyDndzone={{
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
					use:prefetchOnIntent={() => opportunityDetailStore.prefetch(opp.id)}
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
						next_follow_up_at={opp.next_follow_up_at}
						expected_close_date={opp.expected_close_date}
						last_contacted_at={opp.last_contacted_at ?? null}
						quote={opp.quote ?? null}
						{ghostLeadDays}
						{canMarkStatus}
						onMarkWon={() => onMarkStatus?.(opp.id, 'won')}
						onMarkLost={() => onMarkStatus?.(opp.id, 'lost')}
						onQuickFollowUp={(preset) => onQuickFollowUp?.(opp.id, preset)}
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

	{#if canAdd && onAdd}
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
