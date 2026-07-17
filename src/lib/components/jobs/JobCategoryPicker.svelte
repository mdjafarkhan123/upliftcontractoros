<script lang="ts">
	import { SUGGESTED_JOB_CATEGORIES } from '$lib/jobs/jobMeta';

	// Shared job-CATEGORY picker — suggested chips + free-text custom entry. Used by both the
	// New Job form and the job detail page's inline category editor so the two screens stay
	// in lockstep (Jobber's "edit page consistent with the create page" pattern).
	//
	// This is the WORK category ("Repair", "Installation"), stored in jobs.job_category. It is
	// NOT the one-off/recurring job type — that's chosen with the schedule toggle, is stored in
	// jobs.job_type, and is immutable after create.
	let {
		value = $bindable<string>(''),
		autofocus = false
	}: {
		value?: string;
		autofocus?: boolean;
	} = $props();
</script>

<div class="job-chips">
	{#each SUGGESTED_JOB_CATEGORIES as c (c)}
		<button
			type="button"
			class="job-chip"
			class:job-chip--active={value === c}
			aria-pressed={value === c}
			onclick={() => (value = value === c ? '' : c)}
		>
			{c}
		</button>
	{/each}
</div>
<!-- svelte-ignore a11y_autofocus -->
<input class="field__input" bind:value placeholder="Or type a custom category" {autofocus} />
