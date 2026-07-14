<script lang="ts">
	// Shared "Edit" pencil button for the top-right of a detail section card.
	// Replaces the copy-pasted <button class="job-section__edit"> markup used by
	// every Job section card (Schedule / Products & Services / Billing /
	// Recurring Billing, etc.). Styling stays in the global `.job-section__edit`
	// partial (Styling Law) so this component owns markup only.
	let {
		onclick,
		label = 'Edit',
		ariaLabel
	}: {
		onclick: () => void;
		label?: string;
		ariaLabel?: string;
	} = $props();
</script>

<button type="button" class="job-section__edit" aria-label={ariaLabel} {onclick}>
	<i class="ri-pencil-line" aria-hidden="true"></i>
	{label}
</button>
