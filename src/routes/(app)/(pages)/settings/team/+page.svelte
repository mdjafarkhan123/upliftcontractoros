<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import PageWrapper from '$lib/components/shared/PageWrapper.svelte';
	import SkeletonLoader from '$lib/components/shared/SkeletonLoader.svelte';
	import EmptyState from '$lib/components/shared/EmptyState.svelte';
	import { Switch } from '$lib/components/ui/switch';
	import TeamMemberCard from '$lib/components/team/TeamMemberCard.svelte';
	import { getMemberContext } from '$lib/context/member';
	import { teamStore } from '$lib/stores/team.svelte';

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
		<div class="team-toolbar">
			<label class="settings-switch-inline" for="show-inactive">
				<Switch id="show-inactive" bind:checked={showInactive} />
				Show inactive
			</label>
			{#if canCreate}
			<Button onclick={() => goto('/settings/team/new')}>
				<i class="ri-add-line" aria-hidden="true"></i>
				Add member
			</Button>
			{/if}
		</div>
	{/snippet}

	{#if showSkeleton}
		<SkeletonLoader lines={5} label="Loading team" />
	{:else if showError}
		<p class="settings-note settings-note--error">
			<span class="settings-note__text">{errorMsg}</span>
		</p>
	{:else if items.length === 0}
		<EmptyState
			iconClass="ri-group-line"
			title="No team members yet"
			description={canCreate
				? 'Add your first team member to share access with your crew.'
				: 'Your team will appear here once members are added.'}
			actionLabel={canCreate ? 'Add member' : undefined}
			onAction={canCreate ? () => goto('/settings/team/new') : undefined}
		/>
	{:else}
		<div class="team-stats">
			<div class="team-stats__card">
				<div>
					<p class="team-stats__value">{activeCount}</p>
					<p class="team-stats__label">Active {activeCount === 1 ? 'member' : 'members'}</p>
				</div>
				<span class="team-stats__icon team-stats__icon--active">
					<i class="ri-user-follow-line" aria-hidden="true"></i>
				</span>
			</div>
			<div class="team-stats__card">
				<div>
					<p class="team-stats__value">{totalCount}</p>
					<p class="team-stats__label">Total {totalCount === 1 ? 'member' : 'members'}</p>
				</div>
				<span class="team-stats__icon team-stats__icon--total">
					<i class="ri-group-line" aria-hidden="true"></i>
				</span>
			</div>
		</div>

		<ul class="team-list">
			{#each items as m (m.id)}
				<li>
					<TeamMemberCard member={m} onclick={() => goto(`/settings/team/${m.id}`)} />
				</li>
			{/each}
		</ul>

		{#if inactiveCount > 0 && !showInactive}
			<p class="team-inactive-note">
				{inactiveCount} inactive {inactiveCount === 1 ? 'member' : 'members'} hidden —
				<button type="button" onclick={() => (showInactive = true)}>show all</button>
			</p>
		{/if}
	{/if}
</PageWrapper>

<style lang="scss">
	@use '$lib/styles/tokens' as *;

	.team-list {
		display: flex;
		flex-direction: column;
		gap: $space-2;
		list-style: none;
		padding: 0;
	}
</style>
