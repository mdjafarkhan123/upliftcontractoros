<script lang="ts">
	// Shared scope-of-work + internal-notes editor for the job form. Used by both /jobs/new and
	// the /jobs/[id] edit mode. Scope is crew-facing detail; "Internal notes" is team-only and
	// never shown to the client (matches Jobber's internal Notes vs per-visit instructions). Both
	// feed the shared JobFormState.
	import { Textarea } from '$lib/components/ui/textarea';
	import type { JobFormState } from '$lib/jobs/jobForm.svelte';

	let { form }: { form: JobFormState } = $props();
</script>

<div class="job-section">
	<div class="job-scope-header">
		<label class="field__label" for="scope-field">Scope of work</label>
		<span class="job-scope-counter" class:job-scope-counter--warn={form.scopeCharsLeft < 500}>
			{form.scopeCharsLeft.toLocaleString()} left
		</span>
	</div>
	<Textarea
		id="scope-field"
		bind:value={form.scopeOfWork}
		rows={5}
		placeholder="Crew-facing details — materials, process, access, anything the line items don't capture…"
	/>
</div>

<div class="job-section">
	<div class="field">
		<label class="field__label" for="notes-field">Internal notes</label>
		<p class="field__hint">Internal — visible to your team only, not the client</p>
		<Textarea
			id="notes-field"
			bind:value={form.notes}
			rows={3}
			placeholder="Account context, special handling, anything the crew should know…"
		/>
	</div>
</div>
