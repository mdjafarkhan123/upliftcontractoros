<script lang="ts">
	import { Inbox, Clock, UserMinus, AlertTriangle } from '@lucide/svelte';
	import { cn } from '$lib/utils/cn';
	import type { StatusFilter, AssigneeFilter } from '$lib/stores/inbox.svelte';

	type Chip = {
		key: string;
		label: string;
		icon: typeof Inbox;
		tint: string;
		onClick: () => void;
	};

	let {
		openCount,
		awaitingCount,
		unassignedCount,
		failedCount,
		onSetStatus,
		onSetAssignee
	}: {
		openCount: number;
		awaitingCount: number;
		unassignedCount: number;
		failedCount: number;
		onSetStatus: (s: StatusFilter) => void;
		onSetAssignee: (a: AssigneeFilter) => void;
	} = $props();

	const chips = $derived.by<Chip[]>(() => {
		const out: Chip[] = [
			{
				key: 'open',
				label: `${openCount} open`,
				icon: Inbox,
				tint: 'bg-primary/10 text-primary ring-primary/20 hover:bg-primary/15',
				onClick: () => onSetStatus('open')
			}
		];
		if (awaitingCount > 0) {
			out.push({
				key: 'awaiting',
				label: `${awaitingCount} awaiting you`,
				icon: Clock,
				tint: 'bg-amber-500/10 text-amber-700 ring-amber-500/20 hover:bg-amber-500/15 dark:text-amber-400',
				onClick: () => onSetStatus('open')
			});
		}
		if (unassignedCount > 0) {
			out.push({
				key: 'unassigned',
				label: `${unassignedCount} unassigned`,
				icon: UserMinus,
				tint: 'bg-slate-500/10 text-slate-700 ring-slate-500/20 hover:bg-slate-500/15 dark:text-slate-400',
				onClick: () => onSetAssignee('unassigned')
			});
		}
		if (failedCount > 0) {
			out.push({
				key: 'failed',
				label: `${failedCount} delivery failed`,
				icon: AlertTriangle,
				tint: 'bg-destructive/10 text-destructive ring-destructive/20 hover:bg-destructive/15',
				onClick: () => onSetStatus('open')
			});
		}
		return out;
	});
</script>

<div class="flex flex-wrap items-center gap-1.5" role="group" aria-label="Inbox quick summary">
	{#each chips as c (c.key)}
		{@const Icon = c.icon}
		<button
			type="button"
			onclick={c.onClick}
			class={cn(
				'inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium',
				'ring-1 ring-inset transition-colors duration-150',
				'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background',
				c.tint
			)}
		>
			<Icon class="h-3 w-3" />
			<span>{c.label}</span>
		</button>
	{/each}
</div>
