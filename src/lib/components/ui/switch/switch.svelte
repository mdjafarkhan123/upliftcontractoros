<script lang="ts">
	let {
		checked = $bindable(false),
		disabled = false,
		id,
		class: className = '',
		onchange,
		...rest
	}: {
		checked?: boolean;
		disabled?: boolean;
		id?: string;
		class?: string;
		onchange?: (checked: boolean) => void;
		[key: string]: unknown;
	} = $props();

	function toggle() {
		if (disabled) return;
		checked = !checked;
		onchange?.(checked);
	}
</script>

<button
	{id}
	type="button"
	role="switch"
	aria-checked={checked}
	{disabled}
	onclick={toggle}
	class={['ui-switch', className].filter(Boolean).join(' ')}
	{...rest}
>
	<span class="ui-switch__thumb"></span>
</button>
