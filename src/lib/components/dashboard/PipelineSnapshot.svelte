<script lang="ts">
	import type { DashboardPipelineStage } from '$lib/types/dashboard';
	import { formatCurrency } from '$lib/utils/format';
	import { Lock, GitBranch } from '@lucide/svelte';

	let { stages, locked = false }: { stages: DashboardPipelineStage[] | null; locked?: boolean } =
		$props();

	const maxCount = $derived(
		stages && stages.length > 0 ? Math.max(...stages.map((s) => s.count), 1) : 1
	);
</script>

<section
	class="relative overflow-hidden rounded-2xl border border-border/70 bg-card shadow-card dark:border-white/10"
>
	<header
		class="flex items-center justify-between border-b border-border/70 bg-card-raised/35 px-5 py-4"
	>
		<h2 class="text-base font-semibold tracking-tight text-foreground">Pipeline snapshot</h2>
		<a
			href="/pipeline"
			class="rounded-md text-xs font-medium text-muted-foreground transition-colors duration-150 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			>View all</a
		>
	</header>

	{#if locked}
		<div class="flex flex-col items-center gap-2 bg-muted/20 px-6 py-10 text-center">
			<div class="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
				<Lock class="h-5 w-5 text-muted-foreground" />
			</div>
			<p class="text-sm font-medium text-foreground">Pipeline access required</p>
			<p class="text-xs text-muted-foreground">Ask an admin to grant pipeline visibility.</p>
		</div>
	{:else if !stages || stages.length === 0}
		<div class="flex flex-col items-center gap-2 bg-muted/20 px-6 py-10 text-center">
			<div class="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
				<GitBranch class="h-5 w-5 text-muted-foreground" />
			</div>
			<p class="text-sm font-medium text-foreground">No stages configured</p>
			<p class="text-xs text-muted-foreground">Set up your pipeline to see deals flow.</p>
		</div>
	{:else}
		<ul class="divide-y divide-border/60">
			{#each stages as s (s.stage_id)}
				<li
					class="flex items-center gap-3 px-4 py-3 transition-colors duration-150 hover:bg-card-raised"
				>
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
