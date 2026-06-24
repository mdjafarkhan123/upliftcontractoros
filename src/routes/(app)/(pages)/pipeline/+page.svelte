<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { replaceState } from '$app/navigation';
	import type { DndEvent } from 'svelte-dnd-action';
	import PageWrapper from '$lib/components/shared/PageWrapper.svelte';
	import EmptyState from '$lib/components/shared/EmptyState.svelte';
	import SkeletonLoader from '$lib/components/shared/SkeletonLoader.svelte';
	import { Button } from '$lib/components/ui/button';
	import PipelineColumn from '$lib/components/pipeline/PipelineColumn.svelte';
	import { opportunityDetailStore } from '$lib/stores/opportunityDetail.svelte';
	import PipelineFilters, {
		type PipelineFilterState,
		type CloseRange,
		type AssigneeFilter
	} from '$lib/components/pipeline/PipelineFilters.svelte';
	import { getMemberContext } from '$lib/context/member';
	import { getOrgContext } from '$lib/context/org';
	import { GitBranch, Plus } from '@lucide/svelte';
	import type { OpportunityRow, OpportunityDetail } from '$lib/types/pipeline';
	import { pipelineStore } from '$lib/stores/pipeline.svelte';
	import { jobsStore } from '$lib/stores/jobs.svelte';
	import { formatCurrency } from '$lib/utils/format';
	import { fromZonedTime } from 'date-fns-tz';
	import { toast } from '$lib/stores/toast.svelte';

	const member = getMemberContext();
	const org = getOrgContext();
	const canCreate = $derived(member().can_create_opportunities);
	const canMove = $derived(member().can_move_pipeline_stages);
	// "Mine" scope (assigned-only) and members without revenue access never see
	// aggregate stage totals — those leak company-wide revenue. Full pipeline +
	// revenue permission is required to show the per-stage dollar header.
	const showStageTotal = $derived(member().can_view_full_pipeline && member().can_view_revenue);

	const stages = $derived(pipelineStore.stages);
	const fillColumns = $derived(stages.length <= 5);
	const opportunities = $derived(pipelineStore.opportunities);
	const assignees = $derived(pipelineStore.assignees);

	// svelte-dnd-action's TRIGGERS/SHADOW marker are only read inside drag handlers,
	// which can't fire until lazyDndzone has loaded the engine. Load them lazily
	// (same cached chunk) so they never sit on the board's first-paint critical path.
	type DndConsts = {
		TRIGGERS: typeof import('svelte-dnd-action').TRIGGERS;
		SHADOW: typeof import('svelte-dnd-action').SHADOW_ITEM_MARKER_PROPERTY_NAME;
	};
	let dndConsts = $state<DndConsts | null>(null);

	// Heavy pop-ups (deal detail sheet, new-opportunity form, won/lost dialogs) are
	// only needed after a later click, so they're loaded on demand — clicking the
	// Pipeline tab parses just the board shell. Mirrors the Inbox thread-view pattern.
	let NewOpportunitySheet =
		$state<typeof import('$lib/components/pipeline/NewOpportunitySheet.svelte').default | null>(null);
	let OpportunityDetailSheet =
		$state<typeof import('$lib/components/pipeline/OpportunityDetailSheet.svelte').default | null>(
			null
		);
	let LostReasonDialog =
		$state<typeof import('$lib/components/pipeline/LostReasonDialog.svelte').default | null>(null);
	let ConfirmDialog =
		$state<typeof import('$lib/components/shared/ConfirmDialog.svelte').default | null>(null);

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
		// Warm the dnd constants off the first-paint path. Resolves from the same
		// chunk lazyDndzone fetches, so by the time dragging is possible they're set.
		void import('svelte-dnd-action').then((m) => {
			dndConsts = { TRIGGERS: m.TRIGGERS, SHADOW: m.SHADOW_ITEM_MARKER_PROPERTY_NAME };
		});
		void pipelineStore.load().then(() => {
			// Deep-link from a follow-up notification: /pipeline?deal={id} auto-opens
			// the deal's detail sheet, then the param is stripped so a refresh/back
			// doesn't re-open it.
			const dealId = $page.url.searchParams.get('deal');
			if (dealId) {
				const url = new URL($page.url);
				url.searchParams.delete('deal');
				replaceState(`${url.pathname}${url.search}`, $page.state);
				void openDetail(dealId);
			}
		});
	});

	// Org-TZ ISO for the card kebab quick-set presets (9:00 AM local).
	function quickFollowUpIso(daysAhead: number): string {
		const tz = org().timezone || 'UTC';
		const nowInTz = new Date(new Date().toLocaleString('en-US', { timeZone: tz }));
		const target = new Date(nowInTz);
		target.setHours(9, 0, 0, 0);
		target.setDate(target.getDate() + daysAhead);
		const pad = (n: number) => n.toString().padStart(2, '0');
		const wall = `${target.getFullYear()}-${pad(target.getMonth() + 1)}-${pad(target.getDate())}T09:00`;
		return fromZonedTime(wall, tz).toISOString();
	}

	async function quickFollowUp(id: string, preset: 'tomorrow' | 'in3days' | 'clear') {
		const iso = preset === 'clear' ? null : quickFollowUpIso(preset === 'tomorrow' ? 1 : 3);
		// Optimistic — the dot/chip flips immediately; revert on failure.
		const prev = opportunities.find((o) => o.id === id)?.next_follow_up_at ?? null;
		pipelineStore.update({ id, next_follow_up_at: iso });
		try {
			const res = await fetch(`/api/pipeline/opportunities/${id}`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ next_follow_up_at: iso })
			});
			if (!res.ok) {
				pipelineStore.update({ id, next_follow_up_at: prev });
				const body = await res.json().catch(() => ({}));
				toast.error(body.error ?? 'Failed to set follow-up');
				return;
			}
			toast.success(iso ? 'Follow-up set' : 'Follow-up cleared');
		} catch {
			pipelineStore.update({ id, next_follow_up_at: prev });
			toast.error('Failed to set follow-up');
		}
	}

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
	let pendingStatusId = $state<string | null>(null);
	let actionLoading = $state(false);

	// Each pop-up's chunk is fetched the first time its trigger flips open.
	$effect(() => {
		if (createOpen && !NewOpportunitySheet) {
			void import('$lib/components/pipeline/NewOpportunitySheet.svelte').then(
				(m) => (NewOpportunitySheet = m.default)
			);
		}
	});
	$effect(() => {
		if (detailOpen && !OpportunityDetailSheet) {
			void import('$lib/components/pipeline/OpportunityDetailSheet.svelte').then(
				(m) => (OpportunityDetailSheet = m.default)
			);
		}
	});
	$effect(() => {
		if (pendingWonOpen && !ConfirmDialog) {
			void import('$lib/components/shared/ConfirmDialog.svelte').then(
				(m) => (ConfirmDialog = m.default)
			);
		}
	});
	$effect(() => {
		if (pendingLostOpen && !LostReasonDialog) {
			void import('$lib/components/pipeline/LostReasonDialog.svelte').then(
				(m) => (LostReasonDialog = m.default)
			);
		}
	});

	function newRequestId(): string {
		return crypto.randomUUID();
	}

	// On a stage-move conflict the server no longer echoes the current stage
	// (Rule #14 error shape) — re-pull the board to reconcile.
	async function handleStageConflict() {
		await pipelineStore.refreshOpportunities();
	}

	function onMarkStatus(id: string, status: 'won' | 'lost') {
		pendingStatusId = id;
		if (status === 'won') pendingWonOpen = true;
		else pendingLostOpen = true;
	}

	async function commitStatus(
		status: 'won' | 'lost',
		lost_reason?: string,
		lost_reason_note?: string
	) {
		if (!pendingStatusId) return;
		const id = pendingStatusId;
		actionLoading = true;
		try {
			const res = await fetch(`/api/pipeline/opportunities/${id}/status`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ status, request_id: newRequestId(), lost_reason, lost_reason_note })
			});
			if (res.ok) {
				const body = (await res.json()) as {
					data: { job: { id: string } | null };
				};
				pipelineStore.setOpportunities(opportunities.filter((o) => o.id !== id));
				if (status === 'won') {
					const jobId = body.data?.job?.id;
					jobsStore.invalidate();
					toast.success('Deal won!', {
						description: 'Job created and ready to schedule.',
						...(jobId ? { action: { label: 'View Job', href: `/jobs/${jobId}` } } : {})
					});
				} else {
					toast.info('Deal marked as lost.');
				}
			} else {
				const errBody = (await res.json().catch(() => ({}))) as { error?: string };
				toast.error(errBody.error ?? 'Failed to update deal. Please try again.');
			}
			await pipelineStore.refreshOpportunities();
		} catch {
			toast.error('Something went wrong. Please try again.');
			await pipelineStore.refreshOpportunities();
		} finally {
			actionLoading = false;
			pendingStatusId = null;
			pendingWonOpen = false;
			pendingLostOpen = false;
		}
	}

	function cancelStatus() {
		pendingStatusId = null;
		pendingWonOpen = false;
		pendingLostOpen = false;
	}

	// Forecast KPIs — open pipeline + weighted forecast are derived client-side
	// from the visible (open) deals so they react to filters. Won MTD comes from
	// the server (org timezone, scope-aware) since closed deals are no longer
	// loaded onto the board.
	const stageById = $derived(new Map(stages.map((s) => [s.id, s])));

	const openPipeline = $derived(
		filteredOpportunities
			.filter((o) => o.status === 'open')
			.reduce((sum, o) => sum + (o.value ? parseFloat(o.value) : 0), 0)
	);

	const weightedForecast = $derived(
		filteredOpportunities
			.filter((o) => o.status === 'open')
			.reduce((sum, o) => {
				const stage = stageById.get(o.stage_id);
				const p = stage?.probability;
				if (p == null) return sum;
				const v = o.value ? parseFloat(o.value) : 0;
				return sum + (v * p) / 100;
			}, 0)
	);

	const wonMtd = $derived(parseFloat(pipelineStore.wonMtd || '0'));

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

	// Origin of the in-flight drag, captured at DRAG_STARTED via the library's
	// `info` API. We must NOT infer the source stage by diffing the store at drop
	// time: `handleConsider` mutates the store mid-drag, so by finalize the card
	// already reports the destination stage. Capturing the origin up front is the
	// library's intended pattern for cross-zone moves.
	let draggingId: string | null = null;
	let dragOriginStage: string | null = null;

	function handleConsider(stageId: string) {
		let rafPending = false;
		let latestItems: OpportunityRow[] | null = null;
		return (e: CustomEvent<DndEvent<OpportunityRow>>) => {
			if (dndConsts && e.detail.info.trigger === dndConsts.TRIGGERS.DRAG_STARTED) {
				draggingId = e.detail.info.id;
				dragOriginStage = stageId;
			}
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
			// dndConsts is always set by the time a real finalize fires (the drag
			// engine and the consts resolve from the same chunk).
			if (!dndConsts) return;
			const shadowMarker = dndConsts.SHADOW;
			const cleanItems = e.detail.items.map((it) => {
				const copy = { ...it } as Record<string, unknown>;
				delete copy[shadowMarker];
				return copy as OpportunityRow;
			});

			// Always reconcile this zone's items — both the source and destination
			// zones receive a finalize on a cross-column move and each must update.
			pipelineStore.setOpportunities(reconcile(stageId, cleanItems));

			// A cross-column move emits TWO finalize events: DROPPED_INTO_ANOTHER on
			// the source zone and DROPPED_INTO_ZONE on the destination. Only the
			// destination side owns the persistence + origin bookkeeping. The source
			// side just reconciles (above) and leaves the captured origin intact so
			// the destination event — regardless of firing order — can still use it.
			if (e.detail.info.trigger === dndConsts.TRIGGERS.DROPPED_INTO_ANOTHER) return;

			// Destination side (or a same-column reorder): consume the captured origin.
			const movedId = draggingId;
			const originalStage = dragOriginStage;
			draggingId = null;
			dragOriginStage = null;

			// No tracked drag, or dropped back in its origin column → just a reorder.
			if (!movedId || !originalStage || originalStage === stageId) return;

			const target = findStage(stageId);
			if (!target) return;

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
					await handleStageConflict();
					return;
				}
				if (!res.ok) applyStage(movedId, originalStage);
			} catch {
				applyStage(movedId, originalStage);
			}
		};
	}

	async function openDetail(id: string) {
		// Instant open if the card was prefetched on hover (or seen before);
		// revalidate in the background so the next open is fresh.
		const cached = opportunityDetailStore.get(id);
		if (cached) {
			detail = cached;
			detailOpen = true;
			void opportunityDetailStore.load(id);
			return;
		}
		await opportunityDetailStore.load(id);
		const loaded = opportunityDetailStore.get(id);
		if (!loaded) return;
		detail = loaded;
		detailOpen = true;
	}

	function onDetailChanged(next: OpportunityDetail) {
		detail = next;
		opportunityDetailStore.set(next.id, next);
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
					staleAfterDays={stage.stale_after_days}
					items={grouped.get(stage.id) ?? []}
					canDrag={canMove}
					canAdd={canCreate}
					canMarkStatus={canMove}
					{showStageTotal}
					{isFiltering}
					fill={fillColumns}
					ghostLeadDays={org().ghost_lead_days}
					onConsider={handleConsider(stage.id)}
					onFinalize={handleFinalize(stage.id)}
					onCardClick={openDetail}
					onAdd={openCreate}
					{onMarkStatus}
					onQuickFollowUp={quickFollowUp}
				/>
			{/each}
		</div>
	{/if}
</PageWrapper>

{#if canCreate && NewOpportunitySheet}
	<NewOpportunitySheet
		bind:open={createOpen}
		{assignees}
		initialStageId={createStageId}
		onClose={() => (createOpen = false)}
		{onCreated}
	/>
{/if}

{#if detail && OpportunityDetailSheet}
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

{#if ConfirmDialog}
	<ConfirmDialog
		bind:open={pendingWonOpen}
		title="Mark as won?"
		description="A job will be created automatically and the contact will become a customer."
		confirmLabel="Mark won"
		loading={actionLoading}
		onConfirm={() => commitStatus('won')}
		onCancel={cancelStatus}
	/>
{/if}

{#if LostReasonDialog}
	<LostReasonDialog
		bind:open={pendingLostOpen}
		loading={actionLoading}
		onCancel={cancelStatus}
		onConfirm={(reason, note) => commitStatus('lost', reason, note)}
	/>
{/if}
