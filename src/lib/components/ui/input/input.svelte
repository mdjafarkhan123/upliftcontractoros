<script lang="ts">
	import { cn } from '$lib/utils/cn';
	import type { HTMLInputAttributes } from 'svelte/elements';

	let {
		class: className = '',
		...rest
	}: HTMLInputAttributes & { class?: string } = $props();
</script>

<input
	class={cn(
		'flex h-11 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition-shadow',
		className
	)}
	{...rest}
/>
