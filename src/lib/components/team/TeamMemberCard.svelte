<script lang="ts">
	import type { TeamMemberItem } from '$lib/stores/team.svelte';
	import { prefetchOnIntent } from '$lib/actions/prefetch';
	import { teamDetailStore } from '$lib/stores/teamDetail.svelte';

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

	const roleLabel = $derived(
		member.role === 'admin' ? 'Admin' : member.role === 'manager' ? 'Manager' : 'Member'
	);
</script>

<button
	type="button"
	{onclick}
	use:prefetchOnIntent={() => teamDetailStore.prefetch(member.id)}
	class="member-card"
	class:member-card--inactive={!member.is_active}
>
	<div class="member-avatar member-avatar--{member.role}">
		<div class="member-avatar__disc">{initials}</div>
		{#if member.is_active}
			<span class="member-avatar__dot"></span>
		{/if}
	</div>

	<div class="member-card__info">
		<div class="member-card__name-row">
			<p class="member-card__name">{member.full_name}</p>
			{#if !member.is_active}
				<span class="role-pill role-pill--inactive">Inactive</span>
			{/if}
		</div>
		<p class="member-card__email">{member.email}</p>
	</div>

	<span class="role-pill role-pill--{member.role}">{roleLabel}</span>

	<i class="member-card__chevron ri-arrow-right-s-line" aria-hidden="true"></i>
</button>
