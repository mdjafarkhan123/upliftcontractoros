<script lang="ts">
	import { cn } from '$lib/utils/cn';

	type Variant = 'default' | 'destructive' | 'success';

	let {
		class: className = '',
		variant = 'default' as Variant,
		children
	}: { class?: string; variant?: Variant; children?: import('svelte').Snippet } = $props();

	const variantClasses: Record<Variant, string> = {
		default: 'border-border bg-background text-foreground',
		destructive: 'border-destructive/30 bg-destructive/10 text-destructive',
		success: 'border-green-200 bg-green-50 text-green-700'
	};
</script>

<div
	role="alert"
	class={cn('relative w-full rounded-lg border px-4 py-3 text-sm', variantClasses[variant], className)}
>
	{@render children?.()}
</div>
