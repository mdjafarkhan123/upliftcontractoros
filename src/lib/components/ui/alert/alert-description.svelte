<script lang="ts">
	import { cn } from '$lib/utils/cn';

	let { class: className = '', children }: { class?: string; children?: import('svelte').Snippet } =
		$props();
</script>

<p class={cn('text-sm [&_p]:leading-relaxed', className)}>
	{@render children?.()}
</p>
