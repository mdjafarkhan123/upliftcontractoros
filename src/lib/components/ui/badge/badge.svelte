<script lang="ts">
	import { cn } from '$lib/utils/cn';
	import type { HTMLAttributes } from 'svelte/elements';

	type Variant = 'default' | 'success' | 'warning' | 'danger' | 'info';

	let {
		class: className,
		variant = 'default' as Variant,
		children,
		...rest
	}: HTMLAttributes<HTMLSpanElement> & {
		variant?: Variant;
		children?: import('svelte').Snippet;
	} = $props();

	const variantClasses: Record<Variant, string> = {
		default: 'border-border bg-secondary text-secondary-foreground',
		success: 'border-green-200 bg-green-50 text-green-700',
		warning: 'border-amber-200 bg-amber-50 text-amber-700',
		danger: 'border-red-200 bg-red-50 text-red-700',
		info: 'border-blue-200 bg-blue-50 text-blue-700'
	};
</script>

<span
	class={cn(
		'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium',
		variantClasses[variant],
		className
	)}
	{...rest}
>
	{@render children?.()}
</span>
