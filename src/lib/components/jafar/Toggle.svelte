<script lang="ts">
	import { cn } from '$lib/utils/cn';

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
	class={cn(
		'relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 disabled:cursor-not-allowed disabled:opacity-50',
		checked ? 'bg-gradient-to-b from-red-500 to-red-600 shadow-inner shadow-red-900/50' : 'bg-slate-700',
		className
	)}
>
	<span
		class={cn(
			'pointer-events-none inline-block size-5 transform rounded-full bg-white shadow-md transition-transform',
			checked ? 'translate-x-5' : 'translate-x-0.5'
		)}
	></span>
</button>
