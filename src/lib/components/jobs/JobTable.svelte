<script lang="ts">
	import { goto } from '$app/navigation';
	import { prefetchOnIntent } from '$lib/actions/prefetch';
	import { jobDetailStore } from '$lib/stores/jobDetail.svelte';
	import type { JobListItem } from '$lib/types/jobs';
	import ContactAvatar from '$lib/components/contacts/ContactAvatar.svelte';
	import JobStatusBadge from './JobStatusBadge.svelte';
	import JobBillingBadge from './JobBillingBadge.svelte';
	import RowActionsMenu, { type RowAction } from '$lib/components/shared/RowActionsMenu.svelte';
	import ListTable from '$lib/components/shared/ListTable.svelte';
	import { formatCurrency, formatDateTime } from '$lib/utils/format';

	let {
		items,
		canDelete = false,
		selectable = false,
		selected,
		onToggleSelect,
		onToggleAll,
		allSelected = false,
		onDuplicate,
		onDeleteRequest
	}: {
		items: JobListItem[];
		canDelete?: boolean;
		selectable?: boolean;
		selected?: Set<string>;
		onToggleSelect?: (id: string) => void;
		onToggleAll?: () => void;
		allSelected?: boolean;
		onDuplicate?: (id: string) => void;
		onDeleteRequest?: (id: string, title: string) => void;
	} = $props();

	function addressLine(j: JobListItem): string | null {
		const cityState = [j.service_address_city, j.service_address_state].filter(Boolean).join(', ');
		const parts = [j.service_address_line_1, cityState].filter(Boolean);
		return parts.length > 0 ? parts.join(' · ') : null;
	}

	function jobActions(job: JobListItem): RowAction[] {
		const actions: RowAction[] = [
			{ key: 'edit', label: 'Edit job', icon: 'ri-pencil-line', onSelect: () => goto(`/jobs/${job.id}`) }
		];
		if (onDuplicate)
			actions.push({ key: 'duplicate', label: 'Duplicate', icon: 'ri-file-copy-line', onSelect: () => onDuplicate(job.id) });
		if (canDelete && onDeleteRequest)
			actions.push({ key: 'delete', label: 'Delete job', icon: 'ri-delete-bin-line', destructive: true, onSelect: () => onDeleteRequest(job.id, job.title) });
		return actions;
	}
</script>

<ListTable ariaLabel="Jobs">
	{#snippet head()}
		{#if selectable}
			<th class="list-table__th list-table__th--check">
				<button
					type="button"
					onclick={onToggleAll}
					aria-label="Select all jobs"
					class="list-check"
					class:list-check--on={allSelected}
				>
					{#if allSelected}<i class="ri-check-line" aria-hidden="true"></i>{/if}
				</button>
			</th>
		{/if}
		<th class="list-table__th">Customer</th>
		<th class="list-table__th">Job</th>
		<th class="list-table__th list-table__th--xl">Address</th>
		<th class="list-table__th list-table__th--lg">Scheduled</th>
		<th class="list-table__th">Status</th>
		<th class="list-table__th list-table__th--lg">Billing</th>
		<th class="list-table__th list-table__th--right">Total</th>
		<th class="list-table__th list-table__th--actions"></th>
	{/snippet}

	{#snippet body()}
		{#each items as job (job.id)}
			{@const addr = addressLine(job)}
			{@const isSelected = selected?.has(job.id) ?? false}
			<tr
				class="list-table__row"
				class:list-table__row--selected={isSelected}
				use:prefetchOnIntent={() => {
					if (!selectable) jobDetailStore.prefetch(job.id);
				}}
				onclick={selectable ? () => onToggleSelect?.(job.id) : () => goto(`/jobs/${job.id}`)}
			>
				{#if selectable}
					<td class="list-table__td list-table__td--check">
						<span class="list-check" class:list-check--on={isSelected}>
							{#if isSelected}<i class="ri-check-line" aria-hidden="true"></i>{/if}
						</span>
					</td>
				{/if}

				<!-- Customer -->
				<td class="list-table__td">
					<div class="job-table__customer">
						<ContactAvatar name={job.contact_name} status="customer" size={36} />
						<span class="job-table__customer-name">{job.contact_name}</span>
					</div>
				</td>

				<!-- Job title (+ recurring) -->
				<td class="list-table__td">
					{#if selectable}
						<span class="job-table__title">{job.title}</span>
					{:else}
						<a
							href="/jobs/{job.id}"
							onclick={(e) => e.stopPropagation()}
							class="job-table__title"
						>
							{job.title}
						</a>
					{/if}
					{#if job.is_recurring}
						<span class="job-table__recurring">
							<i class="ri-repeat-line" aria-hidden="true"></i>
							Recurring
						</span>
					{/if}
					<span class="job-table__assignee">
						<i class="ri-user-line" aria-hidden="true"></i>
						{#if job.assignee_name}
							{job.assignee_name}
						{:else}
							<em>Unassigned</em>
						{/if}
					</span>
				</td>

				<!-- Address -->
				<td class="list-table__td list-table__td--xl">
					{#if addr}
						<span class="job-table__muted">{addr}</span>
					{:else}
						<span class="job-table__dash">—</span>
					{/if}
				</td>

				<!-- Scheduled -->
				<td class="list-table__td list-table__td--lg">
					{#if job.scheduled_start}
						<span class="job-table__muted">{formatDateTime(job.scheduled_start)}</span>
					{:else}
						<span class="job-table__never">Unscheduled</span>
					{/if}
				</td>

				<!-- Status -->
				<td class="list-table__td">
					<JobStatusBadge status={job.status} scheduledStart={job.scheduled_start} />
				</td>

				<!-- Billing -->
				<td class="list-table__td list-table__td--lg">
					<JobBillingBadge status={job.status} billing={job.billing} total={job.total} />
				</td>

				<!-- Total -->
				<td class="list-table__td list-table__td--right">
					<span class="job-table__total">{formatCurrency(job.total)}</span>
				</td>

				<!-- Actions -->
				<td class="list-table__td list-table__td--actions" onclick={(e) => e.stopPropagation()}>
					{#if !selectable}
						<RowActionsMenu actions={jobActions(job)} label="Actions for {job.title}" />
					{/if}
				</td>
			</tr>
		{/each}
	{/snippet}
</ListTable>
