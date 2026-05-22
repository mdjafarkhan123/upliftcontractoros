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
		default:
			'border-border bg-secondary text-secondary-foreground dark:border-white/10 dark:bg-card-raised dark:text-muted-foreground',
		success:
			'border-green-200 bg-green-50 text-green-700 dark:border-green-500/25 dark:bg-green-500/10 dark:text-green-300',
		warning:
			'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-300',
		danger:
			'border-red-200 bg-red-50 text-red-700 dark:border-red-500/25 dark:bg-red-500/10 dark:text-red-300',
		info: 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-500/25 dark:bg-blue-500/10 dark:text-blue-300'
	};
</script>

<span
	class={cn(
		'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium shadow-sm',
		variantClasses[variant],
		className
	)}
	{...rest}
>
	{@render children?.()}
</span>
