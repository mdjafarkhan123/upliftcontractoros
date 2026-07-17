import type { OpportunityRow, PipelineStageRow } from '$lib/types/pipeline';

export type Assignee = { id: string; full_name: string };

type Status = 'idle' | 'loading' | 'ready' | 'revalidating' | 'error';

const TTL_MS = 30_000;

let stages = $state<PipelineStageRow[]>([]);
let opportunities = $state<OpportunityRow[]>([]);
let assignees = $state<Assignee[]>([]);
let wonMtd = $state('0');
let status = $state<Status>('idle');
let error = $state<string | null>(null);
let lastFetchedAt = $state(0);
let activeController: AbortController | null = null;

async function fetchAll(signal: AbortSignal): Promise<{
	stages: PipelineStageRow[];
	opportunities: OpportunityRow[];
	assignees: Assignee[];
	won_mtd: string;
}> {
	const [stagesRes, oppsRes, assigneesRes] = await Promise.all([
		fetch('/api/pipeline/stages', { signal }),
		fetch('/api/pipeline/opportunities', { signal }),
		fetch('/api/contacts/assignees', { signal })
	]);
	if (!stagesRes.ok || !oppsRes.ok) throw new Error('Failed to load pipeline.');
	const stagesBody = (await stagesRes.json()) as { stages: PipelineStageRow[] };
	const oppsBody = (await oppsRes.json()) as { opportunities: OpportunityRow[]; won_mtd: string };
	let assigneesList: Assignee[] = [];
	if (assigneesRes.ok) {
		const a = (await assigneesRes.json()) as { assignees: Assignee[] };
		assigneesList = a.assignees;
	}
	return {
		stages: stagesBody.stages,
		opportunities: oppsBody.opportunities,
		assignees: assigneesList,
		won_mtd: oppsBody.won_mtd ?? '0'
	};
}

async function fetchOpportunities(
	signal: AbortSignal
): Promise<{ opportunities: OpportunityRow[]; won_mtd: string }> {
	const res = await fetch('/api/pipeline/opportunities', { signal });
	if (!res.ok) throw new Error('Failed to load opportunities.');
	const body = (await res.json()) as { opportunities: OpportunityRow[]; won_mtd: string };
	return { opportunities: body.opportunities, won_mtd: body.won_mtd ?? '0' };
}

export const pipelineStore = {
	get stages() {
		return stages;
	},
	get opportunities() {
		return opportunities;
	},
	get assignees() {
		return assignees;
	},
	get wonMtd() {
		return wonMtd;
	},
	get status() {
		return status;
	},
	get error() {
		return error;
	},
	get lastFetchedAt() {
		return lastFetchedAt;
	},

	async load(force = false): Promise<void> {
		const hasCached = stages.length > 0;
		const fresh = hasCached && Date.now() - lastFetchedAt < TTL_MS;
		if (fresh && !force) return;

		if (activeController) activeController.abort();
		const controller = new AbortController();
		activeController = controller;

		status = hasCached ? 'revalidating' : 'loading';
		error = null;

		try {
			const body = await fetchAll(controller.signal);
			stages = body.stages;
			opportunities = body.opportunities;
			assignees = body.assignees;
			wonMtd = body.won_mtd;
			lastFetchedAt = Date.now();
			status = 'ready';
		} catch (e) {
			if ((e as { name?: string })?.name === 'AbortError') return;
			error = e instanceof Error ? e.message : 'Failed to load pipeline.';
			status = hasCached ? 'ready' : 'error';
		} finally {
			if (activeController === controller) activeController = null;
		}
	},

	async refreshOpportunities(): Promise<void> {
		const controller = new AbortController();
		try {
			const body = await fetchOpportunities(controller.signal);
			opportunities = body.opportunities;
			wonMtd = body.won_mtd;
			lastFetchedAt = Date.now();
		} catch {
			// keep existing list on failure
		}
	},

	applyStage(id: string, toStageId: string): void {
		opportunities = opportunities.map((o) => (o.id === id ? { ...o, stage_id: toStageId } : o));
	},

	// Optimistic cross-stage move that mirrors what the server returns on the next
	// refetch: the card gets a fresh stage_entered_at and moves to the END of the
	// list, so it lands at the BOTTOM of the destination column (the board sorts by
	// stage_entered_at asc). Keeping optimistic order == server order is what stops
	// the card from jumping after a background revalidate.
	moveToStage(id: string, toStageId: string): void {
		const idx = opportunities.findIndex((o) => o.id === id);
		if (idx === -1) return;
		const moved = {
			...opportunities[idx]!,
			stage_id: toStageId,
			stage_entered_at: new Date().toISOString()
		};
		opportunities = [...opportunities.slice(0, idx), ...opportunities.slice(idx + 1), moved];
	},

	setOpportunities(next: OpportunityRow[]): void {
		opportunities = next;
	},

	update(opp: Partial<OpportunityRow> & { id: string }): void {
		opportunities = opportunities.map((o) => (o.id === opp.id ? { ...o, ...opp } : o));
	},

	invalidate(): void {
		stages = [];
		opportunities = [];
		assignees = [];
		wonMtd = '0';
		lastFetchedAt = 0;
		status = 'idle';
		if (activeController) {
			activeController.abort();
			activeController = null;
		}
	}
};
