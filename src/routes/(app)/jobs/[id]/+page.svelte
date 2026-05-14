<script lang="ts">
	import { onMount } from 'svelte';
	import type { PageData } from './$types';
	import PageWrapper from '$lib/components/shared/PageWrapper.svelte';
	import SkeletonLoader from '$lib/components/shared/SkeletonLoader.svelte';
	import EmptyState from '$lib/components/shared/EmptyState.svelte';
	import ConfirmDialog from '$lib/components/shared/ConfirmDialog.svelte';
	import { Button } from '$lib/components/ui/button';
	import { ArrowLeft, Pencil, ImageIcon } from '@lucide/svelte';
	import JobStatusBadge from '$lib/components/jobs/JobStatusBadge.svelte';
	import JobActionsBar from '$lib/components/jobs/JobActionsBar.svelte';
	import JobScheduleSection from '$lib/components/jobs/JobScheduleSection.svelte';
	import JobScopeSection from '$lib/components/jobs/JobScopeSection.svelte';
	import JobLinksSection from '$lib/components/jobs/JobLinksSection.svelte';
	import JobUpcomingAppointments from '$lib/components/jobs/JobUpcomingAppointments.svelte';
	import JobReviewIndicator from '$lib/components/jobs/JobReviewIndicator.svelte';
	import EditJobSheet from '$lib/components/jobs/EditJobSheet.svelte';
	import { getMemberContext } from '$lib/context/member';
	import { jobsStore } from '$lib/stores/jobs.svelte';
	import type { JobDetail, JobStatus } from '$lib/types/jobs';

	let { data }: { data: PageData } = $props();

	const member = getMemberContext();

	let job = $state<JobDetail | null>(null);
	let loading = $state(true);
	let errorMsg = $state<string | null>(null);
	let editOpen = $state(false);
	let actionLoading = $state(false);
	let completeOpen = $state(false);
	let cancelOpen = $state(false);
	let assignees = $state<{ id: string; full_name: string }[]>([]);

	const canFullPipeline = $derived(member().can_view_full_pipeline);
	const canEdit = $derived.by(() => {
		const m = member();
		if (!job) return false;
		if (m.can_view_full_pipeline) return true;
		if (m.can_view_assigned_jobs) return job.assigned_to === m.id;
		return false;
	});
	const canCancel = $derived(member().can_view_full_pipeline);

	onMount(async () => {
		try {
			const res = await fetch(`/api/jobs/${data.id}`);
			if (res.status === 404) {
				errorMsg = 'Job not found.';
				return;
			}
			if (res.status === 403) {
				errorMsg = 'You do not have access to this job.';
				return;
			}
			if (!res.ok) {
				errorMsg = 'Failed to load job.';
				return;
			}
			const body = (await res.json()) as { job: JobDetail };
			job = body.job;

			if (canFullPipeline) {
				const aRes = await fetch('/api/contacts/assignees');
				if (aRes.ok) {
					const a = (await aRes.json()) as {
						assignees: { id: string; full_name: string }[];
					};
					assignees = a.assignees;
				}
			}
		} catch {
			errorMsg = 'Failed to load job.';
		} finally {
			loading = false;
		}
	});

	function applyToStore(next: JobDetail) {
		jobsStore.update({
			id: next.id,
			title: next.title,
			status: next.status,
			assigned_to: next.assigned_to,
			assignee_name: next.assignee_name,
			scheduled_start: next.scheduled_start,
			scheduled_end: next.scheduled_end
		});
	}

	function onSaved(next: JobDetail) {
		job = next;
		applyToStore(next);
	}

	async function transition(next: JobStatus) {
		if (!job) return;
		actionLoading = true;
		try {
			const res = await fetch(`/api/jobs/${job.id}/status`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ status: next })
			});
			const body = await res.json();
			if (!res.ok) {
				errorMsg = body.error ?? 'Could not update status.';
				return;
			}
			const merged: JobDetail = { ...job, ...body.job };
			job = merged;
			applyToStore(merged);
		} finally {
			actionLoading = false;
		}
	}

	function onStart() {
		void transition('in_progress');
	}
	function onComplete() {
		completeOpen = true;
	}
	function onCancel() {
		cancelOpen = true;
	}
</script>

<svelte:head><title>Job</title></svelte:head>

<PageWrapper class="md:max-w-3xl">
	<Button variant="ghost" href="/jobs" class="mb-4">
		<ArrowLeft class="h-4 w-4" /> Back to jobs
	</Button>

	{#if loading}
		<SkeletonLoader lines={6} height="92px" label="Loading job" />
	{:else if errorMsg}
		<EmptyState title="Couldn't load job" description={errorMsg} />
	{:else if job}
		<div class="space-y-4">
			<header class="rounded-xl border border-border bg-card p-4">
				<div class="flex items-start justify-between gap-3">
					<div class="min-w-0">
						<p class="text-xs font-medium text-muted-foreground">{job.contact_name}</p>
						<h1 class="mt-0.5 text-xl font-semibold leading-tight text-foreground">
							{job.title}
						</h1>
					</div>
					<JobStatusBadge status={job.status} />
				</div>
				<div class="mt-3 flex items-center justify-between gap-2">
					<span class="text-xs text-muted-foreground">Review request</span>
					<JobReviewIndicator status={job.review_request_status} />
				</div>
				{#if canEdit && job.status !== 'completed' && job.status !== 'cancelled'}
					<div class="mt-3">
						<Button variant="outline" class="w-full" onclick={() => (editOpen = true)}>
							<Pencil class="h-4 w-4" /> Edit details
						</Button>
					</div>
				{/if}
			</header>

			<JobActionsBar
				status={job.status}
				{canEdit}
				{canCancel}
				loading={actionLoading}
				{onStart}
				{onComplete}
				{onCancel}
			/>

			<JobScheduleSection
				scheduled_start={job.scheduled_start}
				scheduled_end={job.scheduled_end}
				assignee_name={job.assignee_name}
			/>

			<JobScopeSection scope_of_work={job.scope_of_work} notes={job.notes} />

			<JobLinksSection
				opportunity_id={job.opportunity_id}
				invoice_count={job.invoice_count}
				appointment_count={job.appointment_count}
			/>

			<JobUpcomingAppointments jobId={job.id} />

			<section class="rounded-xl border border-dashed border-border bg-muted/30 p-6 text-center">
				<ImageIcon class="mx-auto h-6 w-6 text-muted-foreground" />
				<p class="mt-2 text-sm font-medium text-foreground">Media</p>
				<p class="text-xs text-muted-foreground">Photo uploads land here in Chapter 16.</p>
			</section>
		</div>

		<EditJobSheet
			bind:open={editOpen}
			{job}
			{assignees}
			canEditAssignee={canFullPipeline}
			onClose={() => (editOpen = false)}
			{onSaved}
		/>

		<ConfirmDialog
			bind:open={completeOpen}
			title="Mark job complete?"
			description="A review request will be triggered for the customer."
			confirmLabel="Mark complete"
			loading={actionLoading}
			onConfirm={async () => {
				await transition('completed');
			}}
		/>

		<ConfirmDialog
			bind:open={cancelOpen}
			title="Cancel this job?"
			description="The job will be marked cancelled. This action cannot be undone."
			confirmLabel="Cancel job"
			variant="destructive"
			loading={actionLoading}
			onConfirm={async () => {
				await transition('cancelled');
			}}
		/>
	{/if}
</PageWrapper>
