<script lang="ts">
	import { onMount } from 'svelte';
	import { SvelteMap } from 'svelte/reactivity';
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
	import type { OpportunityRow, OpportunityDetail, PipelineStageRow } from '$lib/types/pipeline';
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

	// Heavy pop-ups (deal detail sheet, new-opportunity form, won/lost dialogs) are
	// only needed after a later click, so they're loaded on demand — clicking the
	// Pipeline tab parses just the board shell. Mirrors the Inbox thread-view pattern.
	let NewOpportunitySheet = $state<
		typeof import('$lib/components/pipeline/NewOpportunitySheet.svelte').default | null
	>(null);
	let OpportunityDetailSheet = $state<
		typeof import('$lib/components/pipeline/OpportunityDetailSheet.svelte').default | null
	>(null);
	let LostReasonDialog = $state<
		typeof import('$lib/components/pipeline/LostReasonDialog.svelte').default | null
	>(null);
	let ConfirmDialog = $state<
		typeof import('$lib/components/shared/ConfirmDialog.svelte').default | null
	>(null);

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
		// Re-group the authoritative board for the new filter (never mid-drag).
		seedColumns();
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
		patchCard(id, { next_follow_up_at: iso });
		try {
			const res = await fetch(`/api/pipeline/opportunities/${id}`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ next_follow_up_at: iso })
			});
			if (!res.ok) {
				patchCard(id, { next_follow_up_at: prev });
				const body = await res.json().catch(() => ({}));
				toast.error(body.error ?? 'Failed to set follow-up');
				return;
			}
			toast.success(iso ? 'Follow-up set' : 'Follow-up cleared');
		} catch {
			patchCard(id, { next_follow_up_at: prev });
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

	// Global "Add new → Deal" lands here with ?new=1 — open the create sheet, then
	// strip the param so a refresh/back doesn't reopen it. Respects create perms.
	$effect(() => {
		if ($page.url.searchParams.get('new') === '1') {
			if (canCreate) openCreate();
			const url = new URL($page.url);
			url.searchParams.delete('new');
			replaceState(url, {});
		}
	});

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
			// Re-seed the board from the reconciled store (won/lost removes the card).
			seedColumns();
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

	// --- Authoritative board model (canonical svelte-dnd-action pattern) ---
	//
	// `columns` is the SINGLE source of truth for BOTH rendering AND dragging. The
	// drag engine owns these `items` arrays: every `consider`/`finalize` assigns
	// `e.detail.items` straight in, and NOTHING re-derives `columns` from the store
	// while a drag is in flight. That decoupling is the whole fix — the old design
	// kept re-deriving `columns` from the store in a reactive effect, so any
	// background load that resolved mid-drag would rebuild the arrays out from under
	// the library and snap the held card back to its origin (the flicker bug).
	//
	// We re-seed `columns` from the store ONLY on explicit, drag-free moments:
	// initial load, a filter change, and after a create/win/lose. Never on a timer,
	// never mid-drag. Matches Pipedrive / Jobber / the library's documented Kanban.
	//
	// `$state.raw` (shallow) — NOT deep `$state`. svelte-dnd-action's canonical Svelte 5
	// shape wants the drag arrays to be plain values it owns: every update reassigns a
	// whole new array, nothing is deep-proxied and nothing is mutated in place. Deep
	// `$state` here is what made the library's flip reconciliation fight our state
	// (sveltejs/svelte#10115) and forced the fragile per-consider `flushSync`.
	let columns = $state.raw<{ stage: PipelineStageRow; items: OpportunityRow[] }[]>([]);

	// id -> the card's current stage, rebuilt on every seed. A cross-stage drop reads
	// this to discover the card's ORIGIN without having to diff the live (already
	// mutated) columns during the drag.
	let stageByCard = new SvelteMap<string, string>();

	// Rebuild `columns` (and `stageByCard`) from the store's filtered deals, grouped
	// by stage in server sort order. Only ever called outside a drag.
	function seedColumns() {
		const g = new Map<string, OpportunityRow[]>();
		for (const s of stages) g.set(s.id, []);
		for (const o of filteredOpportunities) g.get(o.stage_id)?.push(o);
		columns = stages.map((stage) => ({ stage, items: g.get(stage.id) ?? [] }));
		stageByCard = new SvelteMap(filteredOpportunities.map((o) => [o.id, o.stage_id]));
	}

	// One-time seed the instant the board data is first ready. Guarded by `seeded`
	// so it can NEVER become a continuous rebuild (which was the root cause). It
	// re-runs on remount (revisit), re-seeding from the cached store.
	let seeded = false;
	$effect(() => {
		if (!seeded && pipelineStore.status === 'ready' && stages.length > 0) {
			seeded = true;
			seedColumns();
		}
	});

	// Patch a single card in place — in the store (for KPIs + future re-seeds) and
	// in whichever column currently holds it (for the live board). Used for edits
	// that do NOT change stage/order (e.g. follow-up), so no re-group/reflow.
	function patchCard(id: string, patch: Partial<OpportunityRow>) {
		pipelineStore.update({ id, ...patch });
		columns = columns.map((col) =>
			col.items.some((i) => i.id === id)
				? { ...col, items: col.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) }
				: col
		);
	}

	// Reassign `columns` wholesale (shallow `$state.raw`) so the drag arrays are never
	// deep-proxied and never mutated in place — the canonical Svelte-5 shape the drag
	// engine expects. Only the touched column gets a new object/array; untouched
	// columns keep their identical `items` reference so their zone doesn't re-configure.
	function setItems(stageId: string, items: OpportunityRow[]) {
		columns = columns.map((c) => (c.stage.id === stageId ? { ...c, items } : c));
	}

	// consider + finalize both just hand the library's array straight back to the
	// owning column — this IS the canonical contract, a plain assignment with NO
	// `flushSync`. (The old `flushSync`-per-consider forced a synchronous reflow +
	// re-entrant re-configure on every pointer frame, which was the flicker. The drop
	// crash it was papering over is fixed at the source in svelte-dnd-action 0.9.70.)
	function handleConsider(stageId: string) {
		return (e: CustomEvent<DndEvent<OpportunityRow>>) => setItems(stageId, e.detail.items);
	}

	function handleFinalize(stageId: string) {
		return (e: CustomEvent<DndEvent<OpportunityRow>>) => {
			setItems(stageId, e.detail.items);

			// finalize fires on BOTH the source and destination zones. Act only on the
			// zone that now actually holds the card (destination, or a same-column
			// settle); the source zone no longer contains it, so we skip.
			const movedId = e.detail.info.id;
			const col = columns.find((c) => c.stage.id === stageId);
			if (!col || !col.items.some((i) => i.id === movedId)) return;

			const origin = stageByCard.get(movedId);
			// Same-column reorder — auto-sort model persists nothing.
			if (!origin || origin === stageId) return;

			queueMove(movedId, origin, stageId);
		};
	}

	// Exactly one durable stage mutation may run for a card at a time. A person can
	// still drag it again immediately: we keep only their newest intended stage and
	// send it after the in-flight move succeeds. This is deliberately per-card, so
	// unrelated cards remain fully concurrent.
	type CardMoveState = {
		confirmedStageId: string;
		desiredStageId: string;
		running: boolean;
	};
	const cardMoves = new SvelteMap<string, CardMoveState>();

	function queueMove(id: string, fromStageId: string, toStageId: string) {
		let move = cardMoves.get(id);
		if (!move) {
			move = { confirmedStageId: fromStageId, desiredStageId: toStageId, running: false };
			cardMoves.set(id, move);
		} else {
			move.desiredStageId = toStageId;
		}

		applyOptimisticMove(id, toStageId);
		if (!move.running) void drainMoveQueue(id, move);
	}

	function applyOptimisticMove(id: string, toStageId: string) {
		// Update the card's stage bookkeeping IN PLACE only. We deliberately do NOT
		// reorder the destination array here: svelte-dnd-action is still running its
		// drop animation, and re-sorting the settling list swaps the dropped card's
		// DOM node out from under `animateDraggedToFinalPosition` — which throws
		// "Cannot read properties of undefined (reading 'getBoundingClientRect')",
		// leaves a stuck ghost clone on screen, and re-fires finalize several times
		// (the burst of duplicate 409s). Mutating stage_id/stage_entered_at is
		// prop-level and safe (keyed `each` never moves the node). The card stays
		// exactly where the user dropped it; server sort order is applied on the next
		// drag-free re-seed. Keep the store in sync for the KPI header + re-seeds.
		stageByCard.set(id, toStageId);
		// Stamp the moved card's new stage bookkeeping in its destination column
		// IMMUTABLY (new object + new array, never in place). Same id/position means the
		// keyed `each` reuses the node, so this never fights the running drop animation.
		const enteredAt = new Date().toISOString();
		columns = columns.map((c) =>
			c.stage.id === toStageId
				? {
						...c,
						items: c.items.map((i) =>
							i.id === id ? { ...i, stage_id: toStageId, stage_entered_at: enteredAt } : i
						)
					}
				: c
		);
		pipelineStore.moveToStage(id, toStageId);
	}

	async function drainMoveQueue(id: string, move: CardMoveState) {
		move.running = true;
		try {
			while (move.confirmedStageId !== move.desiredStageId) {
				const fromStageId = move.confirmedStageId;
				const toStageId = move.desiredStageId;
				const res = await fetch(`/api/pipeline/opportunities/${id}/stage`, {
					method: 'PATCH',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({
						stage_id: toStageId,
						from_stage_id: fromStageId,
						move_request_id: newRequestId()
					})
				});

				if (res.ok) {
					move.confirmedStageId = toStageId;
					continue;
				}

				if (res.status === 409) {
					// A real concurrent change won. Do not replay the user's old intent
					// against that new state: reload the authoritative board instead.
					await pipelineStore.refreshOpportunities();
					seedColumns();
					return;
				}

				const body = (await res.json().catch(() => ({}))) as { error?: string };
				await pipelineStore.refreshOpportunities();
				seedColumns();
				toast.error(body.error ?? 'Failed to move deal.');
				return;
			}
		} catch {
			// A network failure leaves the result unknown. Reload rather than guessing
			// whether the server applied it, which prevents a local phantom move.
			await pipelineStore.refreshOpportunities();
			seedColumns();
			toast.error('Failed to move deal.');
		} finally {
			move.running = false;
			cardMoves.delete(id);
		}
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
		// The detail sheet can change the stage — re-seed so the card lands in the
		// right column. Safe: a detail edit never overlaps an in-flight drag.
		seedColumns();
	}

	async function onCreated(id: string) {
		createOpen = false;
		await pipelineStore.refreshOpportunities();
		seedColumns();
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
			<Button onclick={() => openCreate(null)}
				><i class="ri-add-line" aria-hidden="true"></i> New</Button
			>
		{/if}
	{/snippet}

	{#if loading}
		<SkeletonLoader lines={6} height="80px" label="Loading pipeline" />
	{:else if errorMsg}
		<EmptyState title="Couldn't load pipeline" description={errorMsg} />
	{:else if stages.length === 0}
		<EmptyState
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
			<div class="pipeline-kpi">
				<div class="pipeline-kpi__cell">
					<div class="pipeline-kpi__label">Open</div>
					<div class="pipeline-kpi__value">{formatCurrency(openPipeline)}</div>
				</div>
				<div class="pipeline-kpi__cell">
					<div class="pipeline-kpi__label">Forecast</div>
					<div class="pipeline-kpi__value">{formatCurrency(weightedForecast)}</div>
				</div>
				<div class="pipeline-kpi__cell">
					<div class="pipeline-kpi__label">Won MTD</div>
					<div class="pipeline-kpi__value pipeline-kpi__value--success">
						{formatCurrency(wonMtd)}
					</div>
				</div>
			</div>
		{/if}
		<div
			class="pipeline"
			style="height: calc(100vh - 220px); min-height: 480px; touch-action: pan-x;"
		>
			{#each columns as col (col.stage.id)}
				<PipelineColumn
					stageId={col.stage.id}
					stageName={col.stage.name}
					stageColor={col.stage.color}
					staleAfterDays={col.stage.stale_after_days}
					items={col.items}
					canDrag={canMove}
					canAdd={canCreate}
					canMarkStatus={canMove}
					{showStageTotal}
					{isFiltering}
					fill={fillColumns}
					ghostLeadDays={org().ghost_lead_days}
					onConsider={handleConsider(col.stage.id)}
					onFinalize={handleFinalize(col.stage.id)}
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
