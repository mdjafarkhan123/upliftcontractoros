<script lang="ts">
	let {
		titleWidth = 'w-32',
		bodyRows = 3,
		grid = false
	}: { titleWidth?: string; bodyRows?: number; grid?: boolean } = $props();
</script>

<section
	class="rounded-2xl border border-slate-800 bg-slate-900/50 shadow-xl shadow-black/30 overflow-hidden"
>
	<header class="border-b border-slate-800/80 px-5 py-4">
		<div class="h-4 {titleWidth} animate-pulse rounded bg-slate-800"></div>
		<div class="mt-2 h-3 w-48 animate-pulse rounded bg-slate-800/70"></div>
	</header>
	<div class="px-5 py-5">
		{#if grid}
			<div class="grid gap-3 sm:grid-cols-2">
				{#each Array(bodyRows) as _, i (i)}
					<div class="h-12 animate-pulse rounded-lg bg-slate-800/60"></div>
				{/each}
			</div>
		{:else}
			<div class="space-y-3">
				{#each Array(bodyRows) as _, i (i)}
					<div class="h-4 animate-pulse rounded bg-slate-800/60" style="width: {90 - i * 8}%"></div>
				{/each}
			</div>
		{/if}
	</div>
</section>
