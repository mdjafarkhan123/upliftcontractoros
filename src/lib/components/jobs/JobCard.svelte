<script lang="ts">
	import JobStatusBadge from './JobStatusBadge.svelte';
	import { formatDateTime } from '$lib/utils/format';
	import type { JobListItem } from '$lib/types/jobs';
	import { Calendar, User } from '@lucide/svelte';
	import { prefetchOnIntent } from '$lib/actions/prefetch';
	import { jobDetailStore } from '$lib/stores/jobDetail.svelte';

	let { job }: { job: JobListItem } = $props();
</script>

<a
	href={`/jobs/${job.id}`}
	use:prefetchOnIntent={() => jobDetailStore.prefetch(job.id)}
	class="group block rounded-xl border border-border/70 bg-card p-4 shadow-card transition-all duration-150 ease-out hover:border-primary/30 hover:bg-card-raised hover:shadow-dropdown active:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:border-white/10"
>
	<div class="flex items-start justify-between gap-3">
		<div class="min-w-0 flex-1">
			<p class="truncate text-xs font-medium uppercase tracking-wider text-muted-foreground">
				{job.contact_name}
			</p>
			<h3 class="mt-0.5 truncate text-base font-semibold text-foreground">{job.title}</h3>
		</div>
		<JobStatusBadge status={job.status} />
	</div>

	<div class="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
		<span class="inline-flex items-center gap-1">
			<User class="h-3.5 w-3.5 text-muted-foreground/70" />
			{#if job.assignee_name}
				{job.assignee_name}
			{:else}
				<span class="italic">Unassigned</span>
			{/if}
		</span>
		{#if job.scheduled_start}
			<span class="inline-flex items-center gap-1">
				<Calendar class="h-3.5 w-3.5 text-muted-foreground/70" />
				{formatDateTime(job.scheduled_start)}
			</span>
		{/if}
	</div>
</a>
