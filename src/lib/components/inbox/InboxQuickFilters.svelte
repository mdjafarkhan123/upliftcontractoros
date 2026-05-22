<script lang="ts">
	import { Inbox, UserCircle2, Users, Sparkles } from '@lucide/svelte';
	import { cn } from '$lib/utils/cn';
	import type { AssigneeFilter } from '$lib/stores/inbox.svelte';

	let {
		assignee = $bindable<AssigneeFilter>('all'),
		unread = $bindable<boolean>(false),
		canViewAll = true
	}: {
		assignee?: AssigneeFilter;
		unread?: boolean;
		canViewAll?: boolean;
	} = $props();

	const ASSIGNEE_TABS: Array<{ key: AssigneeFilter; label: string; icon: typeof Inbox }> = [
		{ key: 'all', label: 'All', icon: Inbox },
		{ key: 'me', label: 'Mine', icon: UserCircle2 },
		{ key: 'unassigned', label: 'Unassigned', icon: Users }
	];
</script>

<div class="flex flex-wrap items-center gap-2">
	{#if canViewAll}
		<div
			role="tablist"
			aria-label="Assignee filter"
			class="inline-flex items-center gap-1 rounded-full border border-border/60 bg-background p-1 shadow-sm"
		>
			{#each ASSIGNEE_TABS as tab (tab.key)}
				{@const Icon = tab.icon}
				{@const active = assignee === tab.key}
				<button
					type="button"
					role="tab"
					aria-selected={active}
					onclick={() => (assignee = tab.key)}
					class={cn(
						'inline-flex min-h-[36px] items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-all duration-150',
						'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
						active
							? 'bg-primary text-primary-foreground shadow-sm'
							: 'text-muted-foreground hover:bg-muted hover:text-foreground'
					)}
				>
					<Icon class="h-3.5 w-3.5" />
					{tab.label}
				</button>
			{/each}
		</div>
	{/if}

	<button
		type="button"
		aria-pressed={unread}
		onclick={() => (unread = !unread)}
		class={cn(
			'inline-flex min-h-[36px] items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-all duration-150',
			'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
			unread
				? 'border-primary/40 bg-primary/10 text-primary shadow-sm'
				: 'border-border/60 bg-background text-muted-foreground hover:bg-muted hover:text-foreground'
		)}
	>
		<Sparkles class="h-3.5 w-3.5" />
		Unread only
	</button>
</div>
