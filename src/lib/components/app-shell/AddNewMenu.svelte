<script lang="ts">
	import { goto } from '$app/navigation';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import type { OrgMember } from '$lib/types';

	let { member }: { member: OrgMember } = $props();

	type QuickCreate = {
		label: string;
		icon: string;
		tone: 'brand' | 'success' | 'warning' | 'info' | 'purple';
		href: string;
		allowed: boolean;
	};

	// Grouped like Jobber / Housecall Pro / HubSpot quick-create: sales first,
	// then the work + billing a contractor bills for, then communication.
	const groups = $derived<{ label: string; items: QuickCreate[] }[]>([
		{
			label: 'Sales',
			items: [
				{
					label: 'Contact',
					icon: 'ri-user-add-line',
					tone: 'brand',
					href: '/contacts/new',
					allowed: member.can_create_contacts
				},
				{
					label: 'Deal',
					icon: 'ri-stack-line',
					tone: 'purple',
					href: '/pipeline?new=1',
					allowed: member.can_create_opportunities
				},
				{
					label: 'Quote',
					icon: 'ri-file-text-line',
					tone: 'info',
					href: '/quotes/new',
					allowed: member.can_create_quotes
				}
			]
		},
		{
			label: 'Work & billing',
			items: [
				{
					label: 'Job',
					icon: 'ri-briefcase-line',
					tone: 'brand',
					href: '/jobs/new',
					allowed: member.can_view_full_pipeline
				},
				{
					label: 'Invoice',
					icon: 'ri-bill-line',
					tone: 'success',
					href: '/invoices/new',
					allowed: member.can_create_invoices
				},
				{
					label: 'Appointment',
					icon: 'ri-calendar-event-line',
					tone: 'warning',
					href: '/appointments/new',
					allowed: member.can_create_appointments
				}
			]
		},
		{
			label: 'Communicate',
			items: [
				{
					label: 'Message',
					icon: 'ri-chat-1-line',
					tone: 'info',
					href: '/inbox/compose',
					allowed: member.can_send_messages
				}
			]
		}
	]);

	const visibleGroups = $derived(
		groups
			.map((g) => ({ ...g, items: g.items.filter((i) => i.allowed) }))
			.filter((g) => g.items.length > 0)
	);
</script>

<DropdownMenu.Root>
	<DropdownMenu.Trigger class="btn btn--primary btn--sm topbar__add-btn" aria-label="Add new">
		<i class="ri-add-line" aria-hidden="true"></i>
		Add new
	</DropdownMenu.Trigger>

	<DropdownMenu.Content align="end" class="add-new__menu">
		{#each visibleGroups as group, gi (group.label)}
			{#if gi > 0}
				<DropdownMenu.Separator />
			{/if}
			<DropdownMenu.Group>
				<DropdownMenu.Label>{group.label}</DropdownMenu.Label>
				{#each group.items as item (item.label)}
					<DropdownMenu.Item onSelect={() => goto(item.href)}>
						<i
							class="{item.icon} add-new__ico add-new__ico--{item.tone}"
							aria-hidden="true"
						></i>
						{item.label}
					</DropdownMenu.Item>
				{/each}
			</DropdownMenu.Group>
		{/each}
	</DropdownMenu.Content>
</DropdownMenu.Root>

<style lang="scss">
	@use '$lib/styles/tokens' as *;

	.add-new {
		&__ico {
			font-size: 16px;
			flex-shrink: 0;

			&--brand {
				color: var(--color-brand);
			}
			&--success {
				color: var(--success-solid);
			}
			&--warning {
				color: var(--warning-solid);
			}
			&--info {
				color: var(--info-solid);
			}
			&--purple {
				color: #8b5cf6;
			}
		}
	}
</style>
