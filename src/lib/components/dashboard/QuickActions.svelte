<script lang="ts">
	import { getMemberContext } from '$lib/context/member';

	const member = getMemberContext();

	type Action = { label: string; href: string; icon: string; show: boolean };

	const actions = $derived<Action[]>(
		[
			{
				label: 'New quote',
				href: '/quotes/new',
				icon: 'ri-file-add-line',
				show: member().can_create_quotes
			},
			{
				label: 'Add lead',
				href: '/contacts/new',
				icon: 'ri-user-add-line',
				show: member().can_create_contacts
			},
			{
				label: 'Schedule job',
				href: '/jobs/new',
				icon: 'ri-calendar-schedule-line',
				show: member().can_view_full_pipeline
			}
		].filter((a) => a.show)
	);
</script>

{#if actions.length > 0}
	<div class="quick-actions">
		{#each actions as action (action.href)}
			<a href={action.href} class="quick-actions__btn">
				<i class={action.icon}></i>
				{action.label}
			</a>
		{/each}
	</div>
{/if}
