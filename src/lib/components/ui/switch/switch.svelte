<script lang="ts">
	import { cn } from '$lib/utils/cn';

	let {
		checked = $bindable(false),
		disabled = false,
		id,
		class: className,
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
	class={cn(
		'relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50',
		checked ? 'bg-primary' : 'bg-input',
		className
	)}
	{...rest}
>
	<span
		class={cn(
			'pointer-events-none block h-5 w-5 rounded-full bg-background shadow-lg ring-0 transition-transform duration-200 ease-in-out',
			checked ? 'translate-x-5' : 'translate-x-0'
		)}
	></span>
</button>
