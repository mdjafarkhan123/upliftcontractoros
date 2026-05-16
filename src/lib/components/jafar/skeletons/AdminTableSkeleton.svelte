<script lang="ts">
	let {
		columns = 5,
		rows = 6,
		title = 'Loading'
	}: { columns?: number; rows?: number; title?: string } = $props();
</script>

<section
	class="rounded-2xl border border-slate-800 bg-slate-900/50 shadow-xl shadow-black/30 overflow-hidden"
	aria-busy="true"
	aria-label={title}
>
	<header class="flex items-center justify-between border-b border-slate-800/80 px-5 py-4">
		<div>
			<div class="h-4 w-32 animate-pulse rounded bg-slate-800"></div>
			<div class="mt-2 h-3 w-24 animate-pulse rounded bg-slate-800/70"></div>
		</div>
	</header>
	<div class="divide-y divide-slate-800/70">
		{#each Array(rows) as _, r (r)}
			<div class="flex items-center gap-4 px-5 py-3.5">
				{#each Array(columns) as _, c (c)}
					<div
						class="h-4 animate-pulse rounded bg-slate-800/60"
						style="width: {c === 0 ? 22 : c === columns - 1 ? 10 : 14}%"
					></div>
				{/each}
			</div>
		{/each}
	</div>
</section>
