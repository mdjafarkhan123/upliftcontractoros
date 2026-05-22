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
		default:
			'bg-gradient-to-b from-primary to-[hsl(var(--primary-deep))] text-primary-foreground border border-[hsl(var(--primary-edge))] shadow-[inset_0_1px_0_0_hsl(0_0%_100%/0.12),0_1px_2px_0_hsl(0_0%_0%/0.4)] hover:shadow-[inset_0_1px_0_0_hsl(0_0%_100%/0.15),0_2px_8px_-1px_hsl(var(--primary)/0.45)] active:scale-[0.98] active:shadow-[inset_0_1px_2px_0_hsl(0_0%_0%/0.2)]',
		destructive:
			'bg-gradient-to-b from-destructive to-[hsl(var(--destructive-deep))] text-destructive-foreground border border-[hsl(var(--destructive-edge))] shadow-[inset_0_1px_0_0_hsl(0_0%_100%/0.12),0_1px_2px_0_hsl(0_0%_0%/0.4)] hover:shadow-[inset_0_1px_0_0_hsl(0_0%_100%/0.15),0_2px_8px_-1px_hsl(var(--destructive)/0.45)] active:scale-[0.98] active:shadow-[inset_0_1px_2px_0_hsl(0_0%_0%/0.2)]',
		outline:
			'bg-transparent border border-border/60 text-foreground hover:bg-accent/50 hover:border-border active:scale-[0.98]',
		secondary:
			'bg-[hsl(var(--surface-raised))] text-secondary-foreground border border-[hsl(var(--surface-raised-border))] shadow-[inset_0_1px_0_0_hsl(0_0%_100%/0.04)] hover:bg-[hsl(var(--surface-raised-hover))] hover:border-[hsl(var(--surface-raised-border-hover))] active:scale-[0.98]',
		ghost: 'text-foreground hover:bg-accent hover:text-accent-foreground',
		link: 'text-primary underline-offset-4 hover:underline'
	};

	const sizeClasses: Record<Size, string> = {
		default: 'h-9 px-3.5 text-sm',
		sm: 'h-8 px-3 text-xs',
		lg: 'h-10 px-5 text-sm',
		icon: 'h-9 w-9'
	};

	const baseClasses = $derived(
		cn(
			'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-full font-medium leading-none tracking-tight ring-offset-background transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 disabled:active:scale-100 cursor-pointer select-none',
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
