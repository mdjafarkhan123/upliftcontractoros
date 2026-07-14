<script lang="ts" module>
	export type CloseRange = 'all' | 'overdue' | 'month' | 'next30' | 'none';
	export type AssigneeFilter = 'all' | 'mine' | 'unassigned' | string;
	export type PipelineFilterState = {
		q: string;
		assignee: AssigneeFilter;
		close: CloseRange;
	};
</script>

<script lang="ts">
	import type { Assignee } from '$lib/stores/pipeline.svelte';
	import {
		SelectRoot,
		SelectTrigger,
		SelectValue,
		SelectContent,
		SelectItem
	} from '$lib/components/ui/select';

	const CLOSE_LABELS: Record<CloseRange, string> = {
		all: 'Any close date',
		overdue: 'Overdue',
		month: 'This month',
		next30: 'Next 30 days',
		none: 'No close date'
	};

	function assigneeLabel(value: AssigneeFilter, list: Assignee[]): string {
		if (value === 'all') return 'All assignees';
		if (value === 'mine') return 'My opportunities';
		if (value === 'unassigned') return 'Unassigned';
		return list.find((a) => a.id === value)?.full_name ?? 'Assignee';
	}

	type Props = {
		filters: PipelineFilterState;
		assignees: Assignee[];
		showAssignee: boolean;
		activeCount: number;
		onChange: (next: PipelineFilterState) => void;
		onClear: () => void;
	};

	let { filters, assignees, showAssignee, activeCount, onChange, onClear }: Props = $props();

	function update<K extends keyof PipelineFilterState>(key: K, value: PipelineFilterState[K]) {
		onChange({ ...filters, [key]: value });
	}
</script>

<div class="pipeline-filters">
	<div class="pipeline-filters__search">
		<i class="ri-search-line" aria-hidden="true"></i>
		<input
			type="search"
			inputmode="search"
			placeholder="Search title or contact"
			value={filters.q}
			oninput={(e) => update('q', e.currentTarget.value)}
			class="pipeline-filters__input"
		/>
	</div>

	{#if showAssignee}
		<div class="pipeline-filters__select-wrap">
			<SelectRoot
				value={filters.assignee}
				onValueChange={(v) => update('assignee', v as AssigneeFilter)}
			>
				<SelectTrigger aria-label="Assignee">
					<SelectValue placeholder="All assignees">
						{assigneeLabel(filters.assignee, assignees)}
					</SelectValue>
				</SelectTrigger>
				<SelectContent>
					<SelectItem value="all" label="All assignees" />
					<SelectItem value="mine" label="My opportunities" />
					<SelectItem value="unassigned" label="Unassigned" />
					{#each assignees as a (a.id)}
						<SelectItem value={a.id} label={a.full_name} />
					{/each}
				</SelectContent>
			</SelectRoot>
		</div>
	{/if}

	<div class="pipeline-filters__select-wrap">
		<SelectRoot value={filters.close} onValueChange={(v) => update('close', v as CloseRange)}>
			<SelectTrigger aria-label="Expected close">
				<SelectValue placeholder="Any close date">
					{CLOSE_LABELS[filters.close]}
				</SelectValue>
			</SelectTrigger>
			<SelectContent>
				<SelectItem value="all" label="Any close date" />
				<SelectItem value="overdue" label="Overdue" />
				<SelectItem value="month" label="This month" />
				<SelectItem value="next30" label="Next 30 days" />
				<SelectItem value="none" label="No close date" />
			</SelectContent>
		</SelectRoot>
	</div>

	{#if activeCount > 0}
		<span class="pipeline-filters__active-badge">{activeCount} active</span>
		<button type="button" onclick={onClear} class="pipeline-filters__clear">
			<i class="ri-close-line" aria-hidden="true"></i> Clear
		</button>
	{/if}
</div>
