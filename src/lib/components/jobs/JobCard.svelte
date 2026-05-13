<script lang="ts">
	import JobStatusBadge from './JobStatusBadge.svelte';
	import { formatDateTime } from '$lib/utils/format';
	import type { JobListItem } from '$lib/types/jobs';
	import { Calendar, User } from '@lucide/svelte';

	let { job }: { job: JobListItem } = $props();
</script>

<a
	href={`/jobs/${job.id}`}
	class="block rounded-xl border border-border bg-card p-4 transition-colors hover:bg-accent/40 active:bg-accent/60"
>
	<div class="flex items-start justify-between gap-3">
		<div class="min-w-0 flex-1">
			<p class="text-xs font-medium text-muted-foreground">{job.contact_name}</p>
			<h3 class="mt-0.5 truncate text-base font-semibold text-foreground">{job.title}</h3>
		</div>
		<JobStatusBadge status={job.status} />
	</div>

	<div class="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
		<span class="inline-flex items-center gap-1">
			<User class="h-3.5 w-3.5" />
			{#if job.assignee_name}
				{job.assignee_name}
			{:else}
				<span class="italic">Unassigned</span>
			{/if}
		</span>
		{#if job.scheduled_start}
			<span class="inline-flex items-center gap-1">
				<Calendar class="h-3.5 w-3.5" />
				{formatDateTime(job.scheduled_start)}
			</span>
		{/if}
	</div>
</a>
