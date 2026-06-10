<script lang="ts">
	import type { DashboardTodayJob } from '$lib/types/dashboard';
	import { CalendarClock, ChevronRight, Clock } from '@lucide/svelte';

	let { jobs, timezone }: { jobs: DashboardTodayJob[]; timezone: string } = $props();

	const timeFmt = $derived(
		new Intl.DateTimeFormat('en-US', {
			hour: 'numeric',
			minute: '2-digit',
			timeZone: timezone
		})
	);

	function formatTime(iso: string): string {
		const t = Date.parse(iso);
		return isNaN(t) ? '—' : timeFmt.format(t);
	}
</script>

<section
	class="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-card dark:border-white/10"
>
	<header
		class="flex items-center justify-between border-b border-border/70 bg-card-raised/35 px-5 py-4"
	>
		<div class="flex items-center gap-2">
			<h2 class="text-base font-semibold tracking-tight text-foreground">Today's schedule</h2>
			{#if jobs.length > 0}
				<span
					class="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary/10 px-1.5 text-xs font-semibold text-primary"
				>
					{jobs.length}
				</span>
			{/if}
		</div>
		<a
			href="/jobs?status=scheduled"
			class="rounded-md text-xs font-medium text-muted-foreground transition-colors duration-150 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			>View all</a
		>
	</header>

	{#if jobs.length === 0}
		<div class="flex flex-col items-center gap-2 bg-muted/20 px-6 py-8 text-center">
			<div class="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
				<CalendarClock class="h-5 w-5 text-muted-foreground" />
			</div>
			<p class="text-sm font-medium text-foreground">Nothing scheduled today</p>
			<p class="text-xs text-muted-foreground">Jobs starting today will appear here.</p>
		</div>
	{:else}
		<ul class="divide-y divide-border/60">
			{#each jobs as job (job.id)}
				<li>
					<a
						href={`/jobs/${job.id}`}
						class="group flex min-h-[64px] items-center gap-3 px-4 py-3 transition-colors duration-150 ease-out hover:bg-card-raised focus-visible:bg-card-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					>
						<span
							class="flex w-14 shrink-0 flex-col items-center justify-center gap-0.5 rounded-lg bg-muted px-2 py-1.5 ring-1 ring-border/60"
						>
							<Clock class="h-3.5 w-3.5 text-muted-foreground" />
							<span class="text-xs font-semibold tabular-nums text-foreground"
								>{formatTime(job.scheduled_start)}</span
							>
						</span>
						<span class="flex min-w-0 flex-1 flex-col">
							<span class="truncate text-sm font-medium text-foreground">{job.title}</span>
							<span class="truncate text-xs text-muted-foreground"
								>{job.contact_name ?? 'No contact'}</span
							>
						</span>
						{#if job.status === 'in_progress'}
							<span
								class="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-amber-200/70 dark:bg-amber-500/10 dark:text-amber-400 dark:ring-amber-500/20"
								>In progress</span
							>
						{:else}
							<span
								class="shrink-0 rounded-full bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700 ring-1 ring-sky-200/70 dark:bg-sky-500/10 dark:text-sky-400 dark:ring-sky-500/20"
								>Scheduled</span
							>
						{/if}
						<ChevronRight
							class="h-4 w-4 shrink-0 text-muted-foreground/60 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-muted-foreground"
						/>
					</a>
				</li>
			{/each}
		</ul>
	{/if}
</section>
