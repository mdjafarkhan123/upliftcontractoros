<script lang="ts">
	let { scope_of_work, notes }: { scope_of_work: string | null; notes: string | null } = $props();
</script>

<section class="rounded-xl border border-border bg-card p-4">
	<h2 class="text-sm font-semibold text-foreground">Scope of work</h2>
	{#if scope_of_work}
		<p class="mt-2 whitespace-pre-wrap text-sm text-foreground">{scope_of_work}</p>
	{:else}
		<p class="mt-2 text-sm italic text-muted-foreground">No scope set.</p>
	{/if}
</section>

<section class="rounded-xl border border-border bg-card p-4">
	<h2 class="text-sm font-semibold text-foreground">Notes</h2>
	{#if notes}
		<p class="mt-2 whitespace-pre-wrap text-sm text-foreground">{notes}</p>
	{:else}
		<p class="mt-2 text-sm italic text-muted-foreground">No notes.</p>
	{/if}
</section>
