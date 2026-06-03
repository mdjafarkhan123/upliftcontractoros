<script lang="ts">
	import { cn } from '$lib/utils/cn';
	import { ChevronRight } from '@lucide/svelte';
	import type { TeamMemberItem } from '$lib/stores/team.svelte';

	let {
		member,
		onclick
	}: {
		member: TeamMemberItem;
		onclick: () => void;
	} = $props();

	const initials = $derived(
		member.full_name
			.split(' ')
			.map((p) => p[0] ?? '')
			.slice(0, 2)
			.join('')
			.toUpperCase()
	);

	const roleMeta = $derived(
		member.role === 'admin'
			? { label: 'Admin', bg: 'bg-primary/10', text: 'text-primary', border: 'border-primary/20' }
			: member.role === 'manager'
				? {
						label: 'Manager',
						bg: 'bg-amber-50 dark:bg-amber-500/10',
						text: 'text-amber-700 dark:text-amber-400',
						border: 'border-amber-200 dark:border-amber-500/20'
					}
				: {
						label: 'Member',
						bg: 'bg-slate-100 dark:bg-slate-500/10',
						text: 'text-slate-600 dark:text-slate-400',
						border: 'border-slate-200 dark:border-slate-500/20'
					}
	);

	const avatarColor = $derived(
		member.role === 'admin'
			? 'bg-primary/10 text-primary ring-primary/15'
			: member.role === 'manager'
				? 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:ring-amber-500/20'
				: 'bg-slate-100 text-slate-600 ring-slate-200 dark:bg-slate-500/10 dark:text-slate-400 dark:ring-slate-500/20'
	);
</script>

<button
	type="button"
	{onclick}
	class={cn(
		'group flex w-full min-h-[72px] items-center gap-4 rounded-xl border border-border/60 bg-card px-4 py-4 text-left shadow-sm',
		'transition-all duration-150 ease-out hover:border-border hover:bg-muted/30 hover:shadow-md',
		'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
		!member.is_active && 'opacity-50'
	)}
>
	<!-- Avatar with active dot -->
	<div class="relative shrink-0">
		<div
			class={cn(
				'flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold ring-1',
				avatarColor
			)}
		>
			{initials}
		</div>
		{#if member.is_active}
			<span
				class="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-card bg-[hsl(var(--status-active))]"
			></span>
		{/if}
	</div>

	<!-- Info -->
	<div class="min-w-0 flex-1">
		<div class="flex items-center gap-2">
			<p class="truncate text-sm font-semibold text-foreground">{member.full_name}</p>
			{#if !member.is_active}
				<span
					class="inline-flex items-center rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500 dark:border-slate-500/20 dark:bg-slate-500/10 dark:text-slate-400"
				>
					Inactive
				</span>
			{/if}
		</div>
		<p class="truncate text-xs text-muted-foreground">{member.email}</p>
	</div>

	<!-- Role badge -->
	<span
		class={cn(
			'shrink-0 inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium',
			roleMeta.bg,
			roleMeta.text,
			roleMeta.border
		)}
	>
		{roleMeta.label}
	</span>

	<ChevronRight
		class="h-4 w-4 shrink-0 text-muted-foreground/40 transition-all duration-150 group-hover:translate-x-0.5 group-hover:text-muted-foreground/70"
	/>
</button>
