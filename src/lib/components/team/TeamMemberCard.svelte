<script lang="ts">
	import { cn } from '$lib/utils/cn';
	import Badge from '$lib/components/shared/Badge.svelte';
	import type { TeamMemberItem } from '$lib/stores/team.svelte';

	let {
		member,
		onclick
	}: {
		member: TeamMemberItem;
		onclick: () => void;
	} = $props();

	const roleVariant = $derived(
		member.role === 'admin' ? 'info' : member.role === 'manager' ? 'warning' : 'default'
	);

	const roleLabel = $derived(
		member.role === 'admin' ? 'Admin' : member.role === 'manager' ? 'Manager' : 'Member'
	);

	const initials = $derived(
		member.full_name
			.split(' ')
			.map((p) => p[0] ?? '')
			.slice(0, 2)
			.join('')
			.toUpperCase()
	);
</script>

<button
	type="button"
	{onclick}
	class={cn(
		'group flex w-full min-h-[60px] items-center gap-3 rounded-lg border border-border/60 bg-card px-4 py-3 text-left shadow-card transition-all duration-150 ease-out hover:border-border hover:bg-muted/40 hover:shadow-dropdown focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
		!member.is_active && 'opacity-60'
	)}
>
	<div
		class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary ring-1 ring-primary/15"
	>
		{initials}
	</div>

	<div class="min-w-0 flex-1">
		<div class="flex items-center gap-2">
			<p class="truncate text-sm font-semibold text-foreground">{member.full_name}</p>
			{#if !member.is_active}
				<Badge label="Inactive" variant="danger" class="text-xs" />
			{/if}
		</div>
		<p class="truncate text-xs text-muted-foreground">{member.email}</p>
	</div>

	<Badge label={roleLabel} variant={roleVariant} />
</button>
