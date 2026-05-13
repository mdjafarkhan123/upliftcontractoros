<script lang="ts">
	import { cn } from '$lib/utils/cn';
	import type { HTMLTextareaAttributes } from 'svelte/elements';

	let {
		class: className = '',
		value = $bindable<string>(''),
		...rest
	}: Omit<HTMLTextareaAttributes, 'class' | 'value'> & {
		class?: string;
		value?: string;
	} = $props();
</script>

<textarea
	bind:value
	class={cn(
		'flex min-h-[88px] w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition-shadow',
		className
	)}
	{...rest}
></textarea>
