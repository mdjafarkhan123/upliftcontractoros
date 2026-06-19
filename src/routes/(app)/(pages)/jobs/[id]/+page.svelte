<script lang="ts">
	import type { PageData } from './$types';
	import PageWrapper from '$lib/components/shared/PageWrapper.svelte';
	import SkeletonLoader from '$lib/components/shared/SkeletonLoader.svelte';
	import EmptyState from '$lib/components/shared/EmptyState.svelte';
	import ConfirmDialog from '$lib/components/shared/ConfirmDialog.svelte';
	import { Button } from '$lib/components/ui/button';
	import { ArrowLeft, Pencil } from '@lucide/svelte';
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
	import { jobDetailStore } from '$lib/stores/jobDetail.svelte';
	import type { JobDetail, JobStatus } from '$lib/types/jobs';
	import MediaGallery from '$lib/components/media/MediaGallery.svelte';

	let { data }: { data: PageData } = $props();

	const member = getMemberContext();

	const id = $derived(data.id);

	// Stale-while-revalidate load: instant from cache (or after a hover prefetch),
	// otherwise fetches. Re-runs when navigating between jobs.
	$effect(() => {
		void jobDetailStore.load(id);
	});

	const job = $derived(jobDetailStore.get(id));
	const seed = $derived(jobsStore.getById(id));
	const loadingCold = $derived(jobDetailStore.isLoading(id) && !seed);
	const errorMsg = $derived(jobDetailStore.getError(id));

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

	// Instant-shell header: prefer the full record, fall back to the list row we
	// already had (contact name, title, status) so the header paints immediately.
	const headerVM = $derived.by(() => {
		if (job) return { contact_name: job.contact_name, title: job.title, status: job.status };
		if (seed) return { contact_name: seed.contact_name, title: seed.title, status: seed.status };
		return null;
	});

	// Assignees power the edit sheet; only full-pipeline users can reassign. Load
	// once, lazily — never blocks the page render.
	let assigneesLoaded = $state(false);
	$effect(() => {
		if (!canFullPipeline || assigneesLoaded) return;
		assigneesLoaded = true;
		void (async () => {
			const aRes = await fetch('/api/contacts/assignees');
			if (aRes.ok) {
				const a = (await aRes.json()) as { assignees: { id: string; full_name: string }[] };
				assignees = a.assignees;
			}
		})();
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
		jobDetailStore.set(id, next);
		applyToStore(next);
	}

	// Transient action error (status change) shown inline; distinct from the
	// load error that gates the whole page.
	let actionError = $state<string | null>(null);

	async function transition(next: JobStatus) {
		if (!job) return;
		actionLoading = true;
		actionError = null;
		try {
			const res = await fetch(`/api/jobs/${id}/status`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ status: next })
			});
			const body = await res.json();
			if (!res.ok) {
				actionError = body.error ?? 'Could not update status.';
				return;
			}
			const merged: JobDetail = { ...job, ...body.job };
			jobDetailStore.set(id, merged);
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

<svelte:head><title>{headerVM?.title ?? 'Job'}</title></svelte:head>

<PageWrapper>
	<Button variant="ghost" href="/jobs" class="mb-4">
		<ArrowLeft class="h-4 w-4" /> Back to jobs
	</Button>

	{#if loadingCold}
		<SkeletonLoader lines={6} height="92px" label="Loading job" />
	{:else if errorMsg && !job}
		<EmptyState title="Couldn't load job" description={errorMsg} />
	{:else if headerVM}
		{@const h = headerVM}
		<div class="space-y-4">
			<header class="rounded-xl border border-border bg-card p-4">
				<div class="flex items-start justify-between gap-3">
					<div class="min-w-0">
						<p class="text-xs font-medium text-muted-foreground">{h.contact_name}</p>
						<h1 class="mt-0.5 text-xl font-semibold leading-tight text-foreground">
							{h.title}
						</h1>
					</div>
					<JobStatusBadge status={h.status} />
				</div>
				{#if job}
					<div class="mt-3 flex items-center justify-between gap-2">
						<span class="text-xs text-muted-foreground">Review request</span>
						<JobReviewIndicator
							jobId={job.id}
							jobStatus={job.status}
							status={job.review_request_status}
							onSent={(next) => {
								jobDetailStore.patch(id, (prev) => ({ ...prev, review_request_status: next }));
							}}
						/>
					</div>
					{#if canEdit && job.status !== 'completed' && job.status !== 'cancelled'}
						<div class="mt-3">
							<Button variant="outline" class="w-full" onclick={() => (editOpen = true)}>
								<Pencil class="h-4 w-4" /> Edit details
							</Button>
						</div>
					{/if}
				{/if}
			</header>

			{#if job}
				{#if actionError}
					<p class="text-sm text-destructive">{actionError}</p>
				{/if}

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
					job_id={job.id}
					contact_id={job.contact_id}
					contact_name={job.contact_name}
					job_title={job.title}
					opportunity_id={job.opportunity_id}
					invoice_count={job.invoice_count}
					appointment_count={job.appointment_count}
				/>

				<JobUpcomingAppointments jobId={job.id} />

				<MediaGallery
					jobId={job.id}
					canUpload={member().can_upload_files}
					canDelete={member().can_upload_files}
				/>
			{:else}
				<!-- Header is up; the data-heavy panels hydrate a beat later. -->
				<SkeletonLoader lines={5} height="64px" label="Loading job details" />
			{/if}
		</div>

		{#if job}
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
	{:else}
		<EmptyState title="Couldn't load job" description={errorMsg ?? 'Unknown error.'} />
	{/if}
</PageWrapper>
