<script lang="ts">
	import { goto } from '$app/navigation';
	import JobStatusBadge from './JobStatusBadge.svelte';
	import JobBillingBadge from './JobBillingBadge.svelte';
	import { formatCurrency, formatDateTime } from '$lib/utils/format';
	import type { JobListItem } from '$lib/types/jobs';
	import { prefetchOnIntent } from '$lib/actions/prefetch';
	import { jobDetailStore } from '$lib/stores/jobDetail.svelte';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';

	let {
		job,
		canDelete = false,
		onDuplicate,
		onDeleteRequest
	}: {
		job: JobListItem;
		canDelete?: boolean;
		onDuplicate?: (id: string) => void;
		onDeleteRequest?: (id: string, title: string) => void;
	} = $props();

	const addr = $derived(
		(() => {
			const cityState = [job.service_address_city, job.service_address_state]
				.filter(Boolean)
				.join(', ');
			const parts = [job.service_address_line_1, cityState].filter(Boolean);
			return parts.length > 0 ? parts.join(' · ') : null;
		})()
	);
</script>

<a
	href={`/jobs/${job.id}`}
	use:prefetchOnIntent={() => jobDetailStore.prefetch(job.id)}
	class="job-card"
>
	<div class="job-card__top">
		<div class="job-card__identity">
			<p class="job-card__contact">{job.contact_name}</p>
			<h3 class="job-card__title">
				{job.title}
				{#if job.is_recurring}
					<span class="job-card__recurring">
						<i class="ri-repeat-line" aria-hidden="true"></i>
						Recurring
					</span>
				{/if}
			</h3>
		</div>
		<div class="job-card__top-right">
			<JobStatusBadge
				status={job.status}
				scheduledStart={job.scheduled_start}
				hasSeriesAnchor={job.has_series_anchor}
				nextOpenVisitStart={job.next_open_visit_start}
				hasOpenVisits={job.has_open_visits}
				completedAt={job.completed_at}
				cancelledAt={job.cancelled_at}
			/>
			<div onclick={(e) => e.stopPropagation()} role="none">
				<DropdownMenu.Root>
					<DropdownMenu.Trigger class="contact-menu-trigger" aria-label="Actions for {job.title}">
						<i class="ri-more-2-fill" aria-hidden="true"></i>
					</DropdownMenu.Trigger>
					<DropdownMenu.Content align="end">
						<DropdownMenu.Item onclick={() => goto(`/jobs/${job.id}`)}>
							<i class="ri-pencil-line" aria-hidden="true"></i>
							Edit job
						</DropdownMenu.Item>
						{#if onDuplicate}
							<DropdownMenu.Item onclick={() => onDuplicate(job.id)}>
								<i class="ri-file-copy-line" aria-hidden="true"></i>
								Duplicate
							</DropdownMenu.Item>
						{/if}
						{#if canDelete && onDeleteRequest}
							<DropdownMenu.Separator />
							<DropdownMenu.Item
								variant="destructive"
								onclick={() => onDeleteRequest(job.id, job.title)}
							>
								<i class="ri-delete-bin-line" aria-hidden="true"></i>
								Delete job
							</DropdownMenu.Item>
						{/if}
					</DropdownMenu.Content>
				</DropdownMenu.Root>
			</div>
		</div>
	</div>

	<div class="job-card__meta">
		<span class="job-card__meta-item">
			<i class="ri-user-line" aria-hidden="true"></i>
			{#if job.assignee_name}
				{job.assignee_name}
			{:else}
				<em>Unassigned</em>
			{/if}
		</span>
		{#if job.scheduled_start}
			<span class="job-card__meta-item">
				<i class="ri-calendar-line" aria-hidden="true"></i>
				{formatDateTime(job.scheduled_start)}
			</span>
		{:else}
			<span class="job-card__meta-item">
				<i class="ri-calendar-line" aria-hidden="true"></i>
				<em>Unscheduled</em>
			</span>
		{/if}
		{#if addr}
			<span class="job-card__meta-item">
				<i class="ri-map-pin-line" aria-hidden="true"></i>
				{addr}
			</span>
		{/if}
	</div>

	<JobBillingBadge
		cancelledAt={job.cancelled_at}
		billing={job.billing}
		total={job.total}
		class="job-card__billing"
	/>

	<div class="job-card__foot">
		<span class="job-card__total">{formatCurrency(job.total)}</span>
	</div>
</a>
