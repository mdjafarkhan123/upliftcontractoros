<script lang="ts">
	import { SUGGESTED_JOB_TYPES } from '$lib/jobs/jobMeta';

	// Shared job-type picker — suggested chips + free-text custom entry. Used by both the
	// New Job form and the job detail page's inline job-type editor so the two screens stay
	// in lockstep (Jobber's "edit page consistent with the create page" pattern).
	let {
		value = $bindable<string>(''),
		autofocus = false
	}: {
		value?: string;
		autofocus?: boolean;
	} = $props();
</script>

<div class="job-type-chips">
	{#each SUGGESTED_JOB_TYPES as t (t)}
		<button
			type="button"
			class="job-type-chip"
			class:job-type-chip--active={value === t}
			aria-pressed={value === t}
			onclick={() => (value = value === t ? '' : t)}
		>
			{t}
		</button>
	{/each}
</div>
<!-- svelte-ignore a11y_autofocus -->
<input
	class="field__input"
	bind:value
	placeholder="Or type a custom job type"
	{autofocus}
/>
