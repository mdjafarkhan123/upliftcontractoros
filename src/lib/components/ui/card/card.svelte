<script lang="ts">
	import { cn } from '$lib/utils/cn';

	let { class: className = '', children }: { class?: string; children?: import('svelte').Snippet } =
		$props();
</script>

<div
	class={cn(
		'rounded-xl border border-border/70 bg-card text-card-foreground shadow-card dark:border-white/10',
		className
	)}
>
	{@render children?.()}
</div>
