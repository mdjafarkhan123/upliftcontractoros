<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';

	type Variant = 'default' | 'success' | 'warning' | 'danger' | 'info';

	let {
		class: className = '',
		variant = 'default' as Variant,
		children,
		...rest
	}: HTMLAttributes<HTMLSpanElement> & {
		variant?: Variant;
		children?: import('svelte').Snippet;
	} = $props();

	const variantModifier: Record<Variant, string> = {
		default: 'badge--neutral',
		success: 'badge--success',
		warning: 'badge--warning',
		danger: 'badge--danger',
		info: 'badge--info'
	};

	const classes = $derived(
		['badge', variantModifier[variant], className].filter(Boolean).join(' ')
	);
</script>

<span class={classes} {...rest}>
	{@render children?.()}
</span>
