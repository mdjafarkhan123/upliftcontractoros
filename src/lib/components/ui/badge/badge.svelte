<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';

	type Variant = 'default' | 'brand' | 'dark' | 'success' | 'warning' | 'danger' | 'info';
	type Size = 'sm' | 'lg';

	let {
		class: className = '',
		variant = 'default' as Variant,
		size = 'sm' as Size,
		dismissible = false,
		iconOnly = false,
		ondismiss,
		children,
		...rest
	}: HTMLAttributes<HTMLSpanElement> & {
		variant?: Variant;
		size?: Size;
		dismissible?: boolean;
		iconOnly?: boolean;
		ondismiss?: () => void;
		children?: import('svelte').Snippet;
	} = $props();

	const variantModifier: Record<Variant, string> = {
		default: 'badge--neutral',
		brand: 'badge--brand',
		dark: 'badge--dark',
		success: 'badge--success',
		warning: 'badge--warning',
		danger: 'badge--danger',
		info: 'badge--info'
	};

	const classes = $derived(
		[
			'badge',
			variantModifier[variant],
			size === 'lg' && 'badge--lg',
			iconOnly && 'badge--icon-only',
			className
		]
			.filter(Boolean)
			.join(' ')
	);
</script>

{#if dismissible}
	<span class={classes} {...rest}>
		{@render children?.()}
		<button class="badge__dismiss" onclick={ondismiss}>×</button>
	</span>
{:else}
	<span class={classes} {...rest}>
		{@render children?.()}
	</span>
{/if}
