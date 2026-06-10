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
			'group relative overflow-hidden text-white bg-[linear-gradient(135deg,hsl(var(--primary))_0%,hsl(var(--primary-deep))_100%)] shadow-[inset_0_1px_0_0_hsl(0_0%_100%/0.18),inset_0_-1px_0_0_hsl(0_0%_0%/0.25),0_4px_14px_-2px_hsl(var(--primary)/0.45),0_2px_4px_-1px_hsl(var(--primary-deep)/0.3)] hover:shadow-[inset_0_1px_0_0_hsl(0_0%_100%/0.22),inset_0_-1px_0_0_hsl(0_0%_0%/0.25),0_8px_22px_-4px_hsl(var(--primary)/0.55),0_3px_6px_-1px_hsl(var(--primary-deep)/0.35)] hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98]',
		destructive:
			'bg-gradient-to-b from-destructive to-[hsl(var(--destructive-deep))] text-destructive-foreground border border-[hsl(var(--destructive-edge))] shadow-[inset_0_1px_0_0_hsl(0_0%_100%/0.12),0_1px_2px_0_hsl(0_0%_0%/0.4)] hover:-translate-y-0.5 hover:shadow-[inset_0_1px_0_0_hsl(0_0%_100%/0.15),0_4px_16px_-2px_hsl(var(--destructive)/0.45)] active:translate-y-0 active:scale-[0.98] active:shadow-[inset_0_1px_2px_0_hsl(0_0%_0%/0.15)]',
		outline:
			'bg-transparent border border-primary/40 text-foreground shadow-sm hover:-translate-y-0.5 hover:border-primary/70 hover:bg-accent/40 hover:shadow-[0_4px_14px_-4px_hsl(var(--primary)/0.15)] active:translate-y-0 active:scale-[0.98] dark:border-[hsl(var(--brand-light)/0.4)] dark:hover:border-[hsl(var(--brand-light)/0.7)]',
		secondary:
			'bg-[hsl(var(--surface-raised))] text-secondary-foreground border border-[hsl(var(--surface-raised-border))] shadow-[inset_0_1px_0_0_hsl(0_0%_100%/0.04)] hover:-translate-y-0.5 hover:bg-[hsl(var(--surface-raised-hover))] hover:border-[hsl(var(--surface-raised-border-hover))] hover:shadow-md active:translate-y-0 active:scale-[0.98]',
		ghost: 'text-foreground hover:bg-accent hover:text-accent-foreground active:scale-[0.98]',
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
			'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-xl font-medium leading-none tracking-tight ring-offset-background transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 disabled:active:scale-100 cursor-pointer select-none',
			variantClasses[variant],
			sizeClasses[size],
			className
		)
	);
</script>

{#if href}
	<a {href} class={baseClasses} {...rest}>
		{#if variant === 'default'}
			<span
				class="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100 bg-[linear-gradient(135deg,hsl(var(--brand-light))_0%,hsl(var(--primary))_100%)]"
			></span>
			<span
				class="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-[linear-gradient(to_bottom,hsl(0_0%_100%/0.18),transparent)]"
			></span>
			<span class="relative inline-flex items-center gap-1.5">
				{@render children?.()}
			</span>
		{:else}
			{@render children?.()}
		{/if}
	</a>
{:else}
	<button {type} {disabled} class={baseClasses} {...rest}>
		{#if variant === 'default'}
			<span
				class="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100 bg-[linear-gradient(135deg,hsl(var(--brand-light))_0%,hsl(var(--primary))_100%)]"
			></span>
			<span
				class="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-[linear-gradient(to_bottom,hsl(0_0%_100%/0.18),transparent)]"
			></span>
			<span class="relative inline-flex items-center gap-1.5">
				{@render children?.()}
			</span>
		{:else}
			{@render children?.()}
		{/if}
	</button>
{/if}
