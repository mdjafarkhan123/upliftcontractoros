<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import PageWrapper from '$lib/components/shared/PageWrapper.svelte';
	import SkeletonLoader from '$lib/components/shared/SkeletonLoader.svelte';
	import EmptyState from '$lib/components/shared/EmptyState.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Switch } from '$lib/components/ui/switch';
	import TeamMemberCard from '$lib/components/team/TeamMemberCard.svelte';
	import { getMemberContext } from '$lib/context/member';
	import { teamStore } from '$lib/stores/team.svelte';
	import { Users, Plus, UserCheck, UsersRound } from '@lucide/svelte';

	const member = getMemberContext();

	let showInactive = $state(false);

	$effect(() => {
		void teamStore.load(showInactive);
	});

	const items = $derived(teamStore.items);
	const status = $derived(teamStore.status);
	const errorMsg = $derived(teamStore.error);
	const showSkeleton = $derived(status === 'loading' && items.length === 0);
	const showError = $derived(status === 'error' && items.length === 0);

	const canCreate = $derived(member().can_create_team_members);

	const activeCount = $derived(items.filter((m) => m.is_active).length);
	const totalCount = $derived(items.length);
	const inactiveCount = $derived(totalCount - activeCount);

	onMount(() => {
		void teamStore.load(false);
	});
</script>

<svelte:head><title>Team</title></svelte:head>

<PageWrapper title="Team" subtitle="Manage team members, roles, and permissions." back="/settings">
	{#snippet actions()}
		<div class="flex items-center gap-3">
			<label
				class="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground select-none"
				for="show-inactive"
			>
				<Switch id="show-inactive" bind:checked={showInactive} />
				Show inactive
			</label>
			{#if canCreate}
				<Button onclick={() => goto('/settings/team/new')}>
					<Plus class="h-4 w-4" />
					Add member
				</Button>
			{/if}
		</div>
	{/snippet}

	{#if showSkeleton}
		<SkeletonLoader lines={5} label="Loading team" />
	{:else if showError}
		<p class="text-sm text-destructive">{errorMsg}</p>
	{:else if items.length === 0}
		<EmptyState
			icon={Users}
			title="No team members yet"
			description={canCreate
				? 'Add your first team member to share access with your crew.'
				: 'Your team will appear here once members are added.'}
			actionLabel={canCreate ? 'Add member' : undefined}
			onAction={canCreate ? () => goto('/settings/team/new') : undefined}
		/>
	{:else}
		<!-- Stat cards -->
		<div class="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
			<div class="rounded-xl border border-border/60 bg-card px-4 py-4 shadow-sm">
				<div class="flex items-start justify-between gap-2">
					<div>
						<p class="text-2xl font-bold tabular-nums text-foreground">{activeCount}</p>
						<p class="mt-0.5 text-xs text-muted-foreground">
							Active {activeCount === 1 ? 'member' : 'members'}
						</p>
					</div>
					<div
						class="flex h-8 w-8 items-center justify-center rounded-lg bg-[hsl(var(--status-active))]/10 text-[hsl(var(--status-active))]"
					>
						<UserCheck class="h-4 w-4" />
					</div>
				</div>
			</div>
			<div class="rounded-xl border border-border/60 bg-card px-4 py-4 shadow-sm">
				<div class="flex items-start justify-between gap-2">
					<div>
						<p class="text-2xl font-bold tabular-nums text-foreground">{totalCount}</p>
						<p class="mt-0.5 text-xs text-muted-foreground">
							Total {totalCount === 1 ? 'member' : 'members'}
						</p>
					</div>
					<div
						class="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary"
					>
						<UsersRound class="h-4 w-4" />
					</div>
				</div>
			</div>
		</div>

		<ul class="flex flex-col gap-2">
			{#each items as m (m.id)}
				<li>
					<TeamMemberCard member={m} onclick={() => goto(`/settings/team/${m.id}`)} />
				</li>
			{/each}
		</ul>

		{#if inactiveCount > 0 && !showInactive}
			<p class="mt-3 text-center text-xs text-muted-foreground">
				{inactiveCount} inactive {inactiveCount === 1 ? 'member' : 'members'} hidden —
				<button
					type="button"
					onclick={() => (showInactive = true)}
					class="underline underline-offset-2 hover:text-foreground transition-colors duration-150"
				>
					show all
				</button>
			</p>
		{/if}
	{/if}
</PageWrapper>
