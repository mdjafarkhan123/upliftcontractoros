<script lang="ts">
	import type { DndEvent } from 'svelte-dnd-action';
	import { lazyDndzone } from '$lib/actions/lazyDndzone';
	import { flip } from 'svelte/animate';
	import OpportunityCard from './OpportunityCard.svelte';
	import { formatCurrency } from '$lib/utils/format';
	import type { OpportunityRow } from '$lib/types/pipeline';
	import { prefetchOnIntent } from '$lib/actions/prefetch';
	import { opportunityDetailStore } from '$lib/stores/opportunityDetail.svelte';

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

	// Cosmetic props ONLY — never touch `transform` or `transition` here. The drag
	// engine owns `transform` (it writes translate3d every frame to follow the cursor,
	// and a translate tween on drop); a `scale()` here wrote the same CSS property and
	// stomped that, jittering the held card. It also manages `transition` for morph/drop.
	function transformDraggedElement(el?: HTMLElement) {
		if (!el) return;
		el.style.boxShadow = '0 20px 40px rgba(0,0,0,0.18)';
		el.style.opacity = '0.95';
		el.style.willChange = 'transform';
	}

	function onCardKey(e: KeyboardEvent, id: string) {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			onCardClick(id);
		}
	}
</script>

<section class="pipeline-column{fill ? ' pipeline-column--fill' : ''}" data-stage-id={stageId}>
	<div class="pipeline-column__accent" style:background-color={stageColor} aria-hidden="true"></div>

	<header class="pipeline-column__header">
		<div class="pipeline-column__header-left">
			<h2 class="pipeline-column__title">{stageName}</h2>
			<span class="pipeline-column__count">{items.length}</span>
		</div>
		{#if showStageTotal && items.length > 0}
			<span class="pipeline-column__total">{formatCurrency(totalValue)}</span>
		{/if}
	</header>

	<div class="pipeline-column__body">
		<div
			class="pipeline-column__list"
			use:lazyDndzone={{
				items,
				type: 'opportunity',
				dropTargetStyle: {},
				dropTargetClasses: ['is-drop-target'],
				dragDisabled: !canDrag,
				flipDurationMs: flipDuration,
				useCursorForDetection: true,
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
					aria-label="{opp.contact_name} — {opp.title}"
					style="border-radius: 12px; outline: none;"
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
			<div class="pipeline-column__empty">
				{isFiltering ? 'No matches in this stage' : 'Drop or add here'}
			</div>
		{/if}
	</div>

	{#if canAdd && onAdd}
		<button type="button" class="pipeline-column__add-btn" onclick={() => onAdd?.(stageId)}>
			<i class="ri-add-line" aria-hidden="true"></i>
			Add opportunity
		</button>
	{/if}
</section>
