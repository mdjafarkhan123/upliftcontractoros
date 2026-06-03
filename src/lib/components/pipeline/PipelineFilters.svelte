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
	import { Search, X } from '@lucide/svelte';
	import { cn } from '$lib/utils/cn';
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

<div
	class="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-border/60 bg-card p-2"
>
	<div class="relative w-full min-w-0 sm:w-64 sm:flex-none">
		<span
			class="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted-foreground"
		>
			<Search class="size-4" />
		</span>
		<input
			type="search"
			inputmode="search"
			placeholder="Search title or contact"
			value={filters.q}
			oninput={(e) => update('q', e.currentTarget.value)}
			class="h-11 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-sm text-foreground shadow-sm focus-visible:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:border-white/10 dark:bg-card-raised/70"
		/>
	</div>

	{#if showAssignee}
		<div class={cn('w-full sm:w-56', filters.assignee !== 'all' && '[--filter-active:1]')}>
			<SelectRoot
				value={filters.assignee}
				onValueChange={(v) => update('assignee', v as AssigneeFilter)}
			>
				<SelectTrigger
					aria-label="Assignee"
					class={cn(filters.assignee !== 'all' && 'border-primary/50 text-primary')}
				>
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

	<div class="w-full sm:w-48">
		<SelectRoot value={filters.close} onValueChange={(v) => update('close', v as CloseRange)}>
			<SelectTrigger
				aria-label="Expected close"
				class={cn(filters.close !== 'all' && 'border-primary/50 text-primary')}
			>
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
		<span
			class="inline-flex h-7 items-center rounded-full bg-primary/10 px-2 text-xs font-medium text-primary"
		>
			{activeCount} active
		</span>
		<button
			type="button"
			onclick={onClear}
			class="inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
		>
			<X class="size-3.5" /> Clear
		</button>
	{/if}
</div>
