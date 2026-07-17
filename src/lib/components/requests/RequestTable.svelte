<script lang="ts">
	import { goto } from '$app/navigation';
	import type { RequestListItem } from '$lib/types/requests';
	import RequestStatusBadge from './RequestStatusBadge.svelte';
	import RowActionsMenu, { type RowAction } from '$lib/components/shared/RowActionsMenu.svelte';
	import ListTable from '$lib/components/shared/ListTable.svelte';
	import { formatRelativeShort } from '$lib/utils/format';

	let {
		items,
		canManage = false,
		onArchive,
		onUnarchive,
		onDelete
	}: {
		items: RequestListItem[];
		canManage?: boolean;
		onArchive?: (request: RequestListItem) => void;
		onUnarchive?: (request: RequestListItem) => void;
		onDelete?: (request: RequestListItem) => void;
	} = $props();

	function requestActions(request: RequestListItem): RowAction[] {
		const actions: RowAction[] = [
			{
				key: 'open',
				label: 'Open request',
				icon: 'ri-external-link-line',
				onSelect: () => goto(`/requests/${request.id}`)
			}
		];
		if (canManage && request.status !== 'converted' && request.status !== 'archived' && onArchive)
			actions.push({
				key: 'archive',
				label: 'Archive',
				icon: 'ri-archive-line',
				onSelect: () => onArchive(request)
			});
		if (canManage && request.status === 'archived' && onUnarchive)
			actions.push({
				key: 'unarchive',
				label: 'Unarchive',
				icon: 'ri-inbox-unarchive-line',
				onSelect: () => onUnarchive(request)
			});
		if (canManage && onDelete)
			actions.push({
				key: 'delete',
				label: 'Delete request',
				icon: 'ri-delete-bin-line',
				destructive: true,
				onSelect: () => onDelete(request)
			});
		return actions;
	}
</script>

<ListTable ariaLabel="Requests">
	{#snippet head()}
		<th class="list-table__th">Client</th>
		<th class="list-table__th">Title</th>
		<th class="list-table__th list-table__th--xl">Property</th>
		<th class="list-table__th list-table__th--lg">Contact</th>
		<th class="list-table__th list-table__th--xl">Requested</th>
		<th class="list-table__th">Status</th>
		<th class="list-table__th list-table__th--actions"></th>
	{/snippet}

	{#snippet body()}
		{#each items as request (request.id)}
			<tr class="list-table__row" onclick={() => goto(`/requests/${request.id}`)}>
				<!-- Client + company -->
				<td class="list-table__td">
					<a
						href="/requests/{request.id}"
						onclick={(e) => e.stopPropagation()}
						class="request-tbl__client"
					>
						{request.contact.full_name}
					</a>
					{#if request.contact.company_name}
						<span class="request-tbl__company">{request.contact.company_name}</span>
					{/if}
				</td>

				<!-- Title -->
				<td class="list-table__td">
					<span class="request-tbl__title">{request.title}</span>
				</td>

				<!-- Property — hidden on smaller screens -->
				<td class="list-table__td list-table__td--xl">
					{#if request.property}
						<span class="request-tbl__property">{request.property}</span>
					{:else}
						<span class="request-tbl__muted">—</span>
					{/if}
				</td>

				<!-- Contact (phone + email) -->
				<td class="list-table__td list-table__td--lg">
					{#if request.contact.phone}
						<span class="request-tbl__contact-line">{request.contact.phone}</span>
					{/if}
					{#if request.contact.email}
						<span class="request-tbl__contact-line request-tbl__contact-line--muted">
							{request.contact.email}
						</span>
					{/if}
					{#if !request.contact.phone && !request.contact.email}
						<span class="request-tbl__muted">—</span>
					{/if}
				</td>

				<!-- Requested (relative) -->
				<td class="list-table__td list-table__td--xl">
					<span class="request-tbl__date">{formatRelativeShort(request.requested_at)}</span>
				</td>

				<!-- Status -->
				<td class="list-table__td">
					<RequestStatusBadge status={request.status} />
				</td>

				<!-- Actions -->
				<td class="list-table__td list-table__td--actions" onclick={(e) => e.stopPropagation()}>
					<RowActionsMenu
						actions={requestActions(request)}
						label="Actions for request {request.title}"
					/>
				</td>
			</tr>
		{/each}
	{/snippet}
</ListTable>

<style lang="scss">
	@use '$lib/styles/tokens' as *;

	// Entity CONTENT classes only — table chrome comes from the global
	// .list-table__* (Styling Law: chrome is shared, cells are ours).
	.request-tbl__client {
		display: block;
		font-weight: $weight-semibold;
		color: var(--color-text-primary);
		text-decoration: none;

		&:hover {
			color: var(--color-brand);
		}
	}

	.request-tbl__company {
		display: block;
		font-size: $fs-caption;
		color: var(--color-text-secondary);
	}

	.request-tbl__title {
		color: var(--color-text-primary);
	}

	.request-tbl__property {
		color: var(--color-text-secondary);
		font-size: $fs-body;
	}

	.request-tbl__contact-line {
		display: block;
		font-size: $fs-body;
		color: var(--color-text-primary);

		&--muted {
			color: var(--color-text-secondary);
		}
	}

	.request-tbl__date {
		color: var(--color-text-secondary);
		white-space: nowrap;
	}

	.request-tbl__muted {
		color: var(--color-text-muted);
	}
</style>
