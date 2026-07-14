<script lang="ts">
	let {
		checked = $bindable(false),
		disabled = false,
		ariaLabel,
		class: className = ''
	}: {
		checked?: boolean;
		disabled?: boolean;
		ariaLabel?: string;
		class?: string;
	} = $props();
</script>

<button
	type="button"
	role="switch"
	aria-checked={checked}
	aria-label={ariaLabel}
	{disabled}
	onclick={() => (checked = !checked)}
	class="jafar-toggle {className}"
>
	<span class="jafar-toggle__knob"></span>
</button>
