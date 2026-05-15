<script lang="ts">
	import type { DashboardPipelineStage } from '$lib/types/dashboard';
	import { formatCurrency } from '$lib/utils/format';
	import { Lock, GitBranch } from '@lucide/svelte';

	let {
		stages,
		locked = false
	}: { stages: DashboardPipelineStage[] | null; locked?: boolean } = $props();

	const maxCount = $derived(
		stages && stages.length > 0 ? Math.max(...stages.map((s) => s.count), 1) : 1
	);
</script>

<section class="relative rounded-2xl border border-border bg-card">
	<header class="flex items-center justify-between border-b border-border px-4 py-3">
		<h2 class="text-sm font-semibold text-foreground">Pipeline snapshot</h2>
		<a href="/pipeline" class="text-xs text-muted-foreground hover:text-foreground">View all</a>
	</header>

	{#if locked}
		<div class="flex flex-col items-center gap-2 px-6 py-10 text-center">
			<Lock class="h-5 w-5 text-muted-foreground" />
			<p class="text-sm font-medium text-foreground">Pipeline access required</p>
			<p class="text-xs text-muted-foreground">Ask an admin to grant pipeline visibility.</p>
		</div>
	{:else if !stages || stages.length === 0}
		<div class="flex flex-col items-center gap-2 px-6 py-10 text-center">
			<GitBranch class="h-5 w-5 text-muted-foreground" />
			<p class="text-sm font-medium text-foreground">No stages configured</p>
			<p class="text-xs text-muted-foreground">Set up your pipeline to see deals flow.</p>
		</div>
	{:else}
		<ul class="divide-y divide-border">
			{#each stages as s (s.stage_id)}
				<li class="flex items-center gap-3 px-4 py-3">
					<span
						class="h-2.5 w-2.5 shrink-0 rounded-full"
						style:background-color={s.color}
						aria-hidden="true"
					></span>
					<span class="flex min-w-0 flex-1 flex-col">
						<span class="truncate text-sm font-medium text-foreground">{s.name}</span>
						<div class="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
							<div
								class="h-full rounded-full"
								style:background-color={s.color}
								style:width={`${(s.count / maxCount) * 100}%`}
							></div>
						</div>
					</span>
					<span class="flex shrink-0 flex-col items-end">
						<span class="text-sm font-semibold tabular-nums text-foreground">{s.count}</span>
						<span class="text-xs text-muted-foreground">{formatCurrency(s.value)}</span>
					</span>
				</li>
			{/each}
		</ul>
	{/if}
</section>
