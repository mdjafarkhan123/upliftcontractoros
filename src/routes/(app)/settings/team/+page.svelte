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
	import { Users, Plus } from '@lucide/svelte';

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

	onMount(() => {
		void teamStore.load(false);
	});
</script>

<svelte:head><title>Team</title></svelte:head>

<PageWrapper title="Team" subtitle="Manage team members and their permissions">
	{#snippet actions()}
		<div class="flex items-center gap-3">
			<label class="flex items-center gap-2 text-sm text-muted-foreground" for="show-inactive">
				<Switch id="show-inactive" bind:checked={showInactive} />
				Show inactive
			</label>
			{#if canCreate}
				<Button onclick={() => goto('/settings/team/new')}><Plus class="h-4 w-4" /> Add member</Button>
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
			title="No team members"
			description={canCreate
				? 'Add your first team member to share access with your crew.'
				: 'Your team will appear here once members are added.'}
			actionLabel={canCreate ? 'Add member' : undefined}
			onAction={canCreate ? () => goto('/settings/team/new') : undefined}
		/>
	{:else}
		<ul class="grid gap-3">
			{#each items as m (m.id)}
				<li>
					<TeamMemberCard member={m} onclick={() => goto(`/settings/team/${m.id}`)} />
				</li>
			{/each}
		</ul>
	{/if}
</PageWrapper>
