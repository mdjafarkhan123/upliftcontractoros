<script lang="ts">
	let { scope_of_work, notes }: { scope_of_work: string | null; notes: string | null } = $props();
</script>

<section class="job-section">
	<div class="job-section__head">
		<div class="job-section__head-main">
			<i class="ri-file-list-2-line job-section__icon" aria-hidden="true"></i>
			<h2 class="job-section__title">Scope of work</h2>
		</div>
	</div>
	{#if scope_of_work}
		<p class="job-section__text">{scope_of_work}</p>
	{:else}
		<p class="job-section__empty">No scope set.</p>
	{/if}
</section>

<section class="job-section">
	<div class="job-section__head">
		<div class="job-section__head-main">
			<i class="ri-sticky-note-line job-section__icon" aria-hidden="true"></i>
			<h2 class="job-section__title">Notes</h2>
		</div>
	</div>
	{#if notes}
		<p class="job-section__text">{notes}</p>
	{:else}
		<p class="job-section__empty">No notes.</p>
	{/if}
</section>
