<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { replaceState } from '$app/navigation';
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
	import PipelineFilters, {
		type PipelineFilterState,
		type CloseRange,
		type AssigneeFilter
	} from '$lib/components/pipeline/PipelineFilters.svelte';
	import { getMemberContext } from '$lib/context/member';
	import { GitBranch, Plus } from '@lucide/svelte';
	import type { OpportunityRow, OpportunityDetail } from '$lib/types/pipeline';
	import { pipelineStore } from '$lib/stores/pipeline.svelte';
	import { formatCurrency } from '$lib/utils/format';

	const member = getMemberContext();
	const canCreate = $derived(member().can_create_opportunities);
	const canMove = $derived(member().can_move_pipeline_stages);
	// "Mine" scope (assigned-only) and members without revenue access never see
	// aggregate stage totals — those leak company-wide revenue. Full pipeline +
	// revenue permission is required to show the per-stage dollar header.
	const showStageTotal = $derived(member().can_view_full_pipeline && member().can_view_revenue);

	const stages = $derived(pipelineStore.stages);
	const opportunities = $derived(pipelineStore.opportunities);
	const assignees = $derived(pipelineStore.assignees);

	// --- Filters ---
	const DEFAULT_FILTERS: PipelineFilterState = { q: '', assignee: 'all', close: 'all' };

	function filtersFromUrl(url: URL): PipelineFilterState {
		const q = url.searchParams.get('q') ?? '';
		const assignee = (url.searchParams.get('assignee') ?? 'all') as AssigneeFilter;
		const closeRaw = url.searchParams.get('close') ?? 'all';
		const validCloses: CloseRange[] = ['all', 'overdue', 'month', 'next30', 'none'];
		const close = (validCloses as string[]).includes(closeRaw) ? (closeRaw as CloseRange) : 'all';
		return { q, assignee, close };
	}

	let filters = $state<PipelineFilterState>(filtersFromUrl($page.url));

	const showAssigneeFilter = $derived(member().can_view_full_pipeline);

	const activeFilterCount = $derived(
		(filters.q.trim() ? 1 : 0) +
			(filters.assignee !== 'all' ? 1 : 0) +
			(filters.close !== 'all' ? 1 : 0)
	);

	function syncUrl(next: PipelineFilterState) {
		const url = new URL($page.url);
		const setOrDel = (k: string, v: string, def: string) => {
			if (v && v !== def) url.searchParams.set(k, v);
			else url.searchParams.delete(k);
		};
		setOrDel('q', next.q.trim(), '');
		setOrDel('assignee', next.assignee, 'all');
		setOrDel('close', next.close, 'all');
		replaceState(`${url.pathname}${url.search}`, $page.state);
	}

	function onFiltersChange(next: PipelineFilterState) {
		filters = next;
		syncUrl(next);
	}

	function clearFilters() {
		onFiltersChange({ ...DEFAULT_FILTERS });
	}

	function matchesFilters(o: OpportunityRow): boolean {
		// Search: title + contact name
		const q = filters.q.trim().toLowerCase();
		if (q) {
			const hay = `${o.title} ${o.contact_name ?? ''}`.toLowerCase();
			if (!hay.includes(q)) return false;
		}

		// Assignee
		if (showAssigneeFilter && filters.assignee !== 'all') {
			if (filters.assignee === 'mine') {
				if (o.assigned_to !== member().id) return false;
			} else if (filters.assignee === 'unassigned') {
				if (o.assigned_to !== null) return false;
			} else {
				if (o.assigned_to !== filters.assignee) return false;
			}
		}

		// Expected close
		if (filters.close !== 'all') {
			const ecd = o.expected_close_date;
			if (filters.close === 'none') {
				if (ecd) return false;
			} else {
				if (!ecd) return false;
				const d = new Date(ecd + 'T00:00:00');
				const now = new Date();
				const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
				if (filters.close === 'overdue') {
					if (!(d < today) || o.closed_at) return false;
				} else if (filters.close === 'month') {
					const start = new Date(now.getFullYear(), now.getMonth(), 1);
					const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
					if (!(d >= start && d < end)) return false;
				} else if (filters.close === 'next30') {
					const end = new Date(today);
					end.setDate(end.getDate() + 30);
					if (!(d >= today && d <= end)) return false;
				}
			}
		}

		return true;
	}

	const filteredOpportunities = $derived(opportunities.filter(matchesFilters));
	const isFiltering = $derived(activeFilterCount > 0);
	const loading = $derived(pipelineStore.status === 'loading' || pipelineStore.status === 'idle');
	const errorMsg = $derived(pipelineStore.status === 'error' ? pipelineStore.error : null);

	onMount(() => {
		void pipelineStore.load();
	});

	let createOpen = $state(false);
	let createStageId = $state<string | null>(null);
	let detailOpen = $state(false);
	let detail = $state<OpportunityDetail | null>(null);

	function openCreate(stageId: string | null = null) {
		createStageId = stageId;
		createOpen = true;
	}

	let pendingWonOpen = $state(false);
	let pendingLostOpen = $state(false);
	let pendingMove = $state<{ id: string; from: string; requestId: string } | null>(null);
	let actionLoading = $state(false);

	function newRequestId(): string {
		return crypto.randomUUID();
	}

	async function handleStageConflict(oppId: string, body: { current_stage_id?: string | null }) {
		if (body?.current_stage_id) {
			pipelineStore.applyStage(oppId, body.current_stage_id);
		} else {
			await pipelineStore.refreshOpportunities();
		}
	}

	// Forecast KPIs — open pipeline, weighted forecast, Won MTD.
	// v1 limitation: Won MTD month boundary is computed in UTC against
	// `closed_at`. Contractors in non-UTC timezones near the month boundary
	// may see a deal counted into an adjacent month. Localized boundaries
	// are deferred until we move the math server-side with the org timezone.
	const stageById = $derived(new Map(stages.map((s) => [s.id, s])));

	const openPipeline = $derived(
		filteredOpportunities
			.filter((o) => !o.closed_at)
			.reduce((sum, o) => sum + (o.value ? parseFloat(o.value) : 0), 0)
	);

	const weightedForecast = $derived(
		filteredOpportunities
			.filter((o) => !o.closed_at)
			.reduce((sum, o) => {
				const stage = stageById.get(o.stage_id);
				const p = stage?.probability;
				if (p == null) return sum;
				const v = o.value ? parseFloat(o.value) : 0;
				return sum + (v * p) / 100;
			}, 0)
	);

	const wonMtd = $derived.by(() => {
		const now = new Date();
		const startUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
		return filteredOpportunities
			.filter((o) => {
				if (!o.closed_at) return false;
				const stage = stageById.get(o.stage_id);
				if (!stage?.is_won) return false;
				return new Date(o.closed_at).getTime() >= startUtc;
			})
			.reduce((sum, o) => sum + (o.value ? parseFloat(o.value) : 0), 0);
	});

	const grouped = $derived.by(() => {
		const m = new Map<string, OpportunityRow[]>();
		for (const s of stages) m.set(s.id, []);
		for (const o of filteredOpportunities) {
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

	function reconcile(stageId: string, incoming: OpportunityRow[]) {
		const incomingIds = new Set(incoming.map((i) => i.id));
		const result: OpportunityRow[] = [];
		for (let i = 0; i < opportunities.length; i++) {
			const o = opportunities[i]!;
			if (incomingIds.has(o.id)) continue;
			if (o.stage_id === stageId && matchesFilters(o)) continue;
			result.push(o);
		}
		for (let i = 0; i < incoming.length; i++) {
			result.push({ ...incoming[i]!, stage_id: stageId });
		}
		return result;
	}

	function handleConsider(stageId: string) {
		let rafPending = false;
		let latestItems: OpportunityRow[] | null = null;
		return (e: CustomEvent<DndEvent<OpportunityRow>>) => {
			latestItems = e.detail.items;
			if (!rafPending) {
				rafPending = true;
				requestAnimationFrame(() => {
					rafPending = false;
					if (latestItems) {
						pipelineStore.setOpportunities(reconcile(stageId, latestItems));
					}
				});
			}
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

			pipelineStore.setOpportunities(reconcile(stageId, cleanItems));

			if (!movedId || !originalStage) return; // reorder within same column

			const target = findStage(stageId);
			if (!target) return;

			if (target.is_won) {
				pendingMove = { id: movedId, from: originalStage, requestId: newRequestId() };
				pendingWonOpen = true;
				return;
			}
			if (target.is_lost) {
				pendingMove = { id: movedId, from: originalStage, requestId: newRequestId() };
				pendingLostOpen = true;
				return;
			}

			try {
				const res = await fetch(`/api/pipeline/opportunities/${movedId}/stage`, {
					method: 'PATCH',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({
						stage_id: stageId,
						from_stage_id: originalStage,
						move_request_id: newRequestId()
					})
				});
				if (res.status === 409) {
					const body = await res.json().catch(() => ({}));
					await handleStageConflict(movedId, body);
					return;
				}
				if (!res.ok) applyStage(movedId, originalStage);
			} catch {
				applyStage(movedId, originalStage);
			}
		};
	}

	async function commitMove(stage_id: string, lost_reason?: string) {
		if (!pendingMove) return;
		const move = pendingMove;
		actionLoading = true;
		try {
			const res = await fetch(`/api/pipeline/opportunities/${move.id}/stage`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					stage_id,
					from_stage_id: move.from,
					move_request_id: move.requestId,
					lost_reason
				})
			});
			if (res.status === 409) {
				const body = await res.json().catch(() => ({}));
				await handleStageConflict(move.id, body);
			} else if (!res.ok) {
				applyStage(move.id, move.from);
			} else {
				const body = (await res.json()) as { opportunity: OpportunityRow };
				pipelineStore.update({ ...body.opportunity, id: move.id });
			}
		} catch {
			applyStage(move.id, move.from);
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
			<Button onclick={() => openCreate(null)}><Plus class="h-4 w-4" /> New</Button>
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
		<PipelineFilters
			{filters}
			{assignees}
			showAssignee={showAssigneeFilter}
			activeCount={activeFilterCount}
			onChange={onFiltersChange}
			onClear={clearFilters}
		/>
		{#if showStageTotal}
			<div
				class="mb-3 grid grid-cols-3 gap-2 rounded-lg border border-border/60 bg-card p-2 text-center sm:gap-3 sm:p-3"
			>
				<div>
					<div class="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
						Open
					</div>
					<div class="text-sm font-semibold tabular-nums text-foreground sm:text-base">
						{formatCurrency(openPipeline)}
					</div>
				</div>
				<div class="border-x border-border/60">
					<div class="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
						Forecast
					</div>
					<div class="text-sm font-semibold tabular-nums text-foreground sm:text-base">
						{formatCurrency(weightedForecast)}
					</div>
				</div>
				<div>
					<div class="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
						Won MTD
					</div>
					<div class="text-sm font-semibold tabular-nums text-emerald-600 sm:text-base">
						{formatCurrency(wonMtd)}
					</div>
				</div>
			</div>
		{/if}
		<div
			class="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-4 md:mx-0 md:px-0 md:snap-none"
			style="height: calc(100vh - 220px); min-height: 480px; touch-action: pan-x;"
		>
			{#each stages as stage (stage.id)}
				<PipelineColumn
					stageId={stage.id}
					stageName={stage.name}
					stageColor={stage.color}
					isWon={stage.is_won}
					isLost={stage.is_lost}
					staleAfterDays={stage.stale_after_days}
					items={grouped.get(stage.id) ?? []}
					canDrag={canMove}
					canAdd={canCreate}
					{showStageTotal}
					{isFiltering}
					onConsider={handleConsider(stage.id)}
					onFinalize={handleFinalize(stage.id)}
					onCardClick={openDetail}
					onAdd={openCreate}
				/>
			{/each}
		</div>
	{/if}
</PageWrapper>

{#if canCreate}
	<NewOpportunitySheet
		bind:open={createOpen}
		{assignees}
		initialStageId={createStageId}
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
