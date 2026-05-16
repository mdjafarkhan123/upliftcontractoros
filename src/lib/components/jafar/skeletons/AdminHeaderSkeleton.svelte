<script lang="ts">
	let { withPill = true }: { withPill?: boolean } = $props();
</script>

<div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
	<div class="min-w-0 space-y-2">
		<div class="flex flex-wrap items-center gap-3">
			<div class="h-8 w-56 animate-pulse rounded bg-slate-800"></div>
			{#if withPill}
				<div class="h-5 w-20 animate-pulse rounded-full bg-slate-800/70"></div>
			{/if}
		</div>
		<div class="h-3 w-72 animate-pulse rounded bg-slate-800/60"></div>
	</div>
</div>
