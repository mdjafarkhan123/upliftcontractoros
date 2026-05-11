<script lang="ts">
	import { cn } from '$lib/utils/cn';
	import type { HTMLButtonAttributes } from 'svelte/elements';

	type Variant = 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link';
	type Size = 'default' | 'sm' | 'lg' | 'icon';

	let {
		class: className = '',
		variant = 'default' as Variant,
		size = 'default' as Size,
		disabled = false,
		type = 'button' as HTMLButtonAttributes['type'],
		href,
		children,
		...rest
	}: {
		class?: string;
		variant?: Variant;
		size?: Size;
		disabled?: boolean;
		type?: HTMLButtonAttributes['type'];
		href?: string;
		children?: import('svelte').Snippet;
		[key: string]: unknown;
	} = $props();

	const variantClasses: Record<Variant, string> = {
		default: 'bg-primary text-primary-foreground hover:bg-primary/90',
		destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
		outline: 'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
		secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
		ghost: 'hover:bg-accent hover:text-accent-foreground',
		link: 'text-primary underline-offset-4 hover:underline'
	};

	const sizeClasses: Record<Size, string> = {
		default: 'h-11 px-4 py-2 text-sm',
		sm: 'h-9 rounded-md px-3 text-xs',
		lg: 'h-12 rounded-md px-8 text-base',
		icon: 'h-11 w-11'
	};

	const baseClasses = $derived(
		cn(
			'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg font-semibold ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 cursor-pointer',
			variantClasses[variant],
			sizeClasses[size],
			className
		)
	);
</script>

{#if href}
	<a {href} class={baseClasses} {...rest}>
		{@render children?.()}
	</a>
{:else}
	<button {type} {disabled} class={baseClasses} {...rest}>
		{@render children?.()}
	</button>
{/if}
