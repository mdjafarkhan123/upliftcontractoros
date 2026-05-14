<script lang="ts">
	import { cn } from '$lib/utils/cn';
	import { Loader2, Check } from '@lucide/svelte';
	import type { HTMLButtonAttributes } from 'svelte/elements';
	import type { Snippet } from 'svelte';

	type Variant = 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost';
	type Size = 'default' | 'sm' | 'lg';
	type State = 'idle' | 'loading' | 'success';

	let {
		label,
		state: externalState,
		onAction,
		variant = 'default' as Variant,
		size = 'default' as Size,
		disabled = false,
		type = 'button' as HTMLButtonAttributes['type'],
		class: className = '',
		successLabel,
		loadingLabel,
		successHoldMs = 1400,
		icon,
		onclick,
		...rest
	}: {
		label: string;
		/** Optional external state — overrides internal state. Use for form submits. */
		state?: State;
		/** Async callback. Component sets state to loading, awaits, then success → idle. */
		onAction?: (e: MouseEvent) => Promise<void> | void;
		variant?: Variant;
		size?: Size;
		disabled?: boolean;
		type?: HTMLButtonAttributes['type'];
		class?: string;
		successLabel?: string;
		loadingLabel?: string;
		/** How long to hold success state before reverting to idle. */
		successHoldMs?: number;
		/** Optional leading icon shown only in idle state. */
		icon?: Snippet;
		onclick?: (e: MouseEvent) => void;
		[key: string]: unknown;
	} = $props();

	let internalState: State = $state('idle');
	const current: State = $derived(externalState ?? internalState);

	const isBusy = $derived(current !== 'idle');

	async function handleClick(e: MouseEvent) {
		if (current !== 'idle') return;
		if (onAction) {
			internalState = 'loading';
			try {
				await onAction(e);
				internalState = 'success';
				if (successHoldMs > 0) {
					setTimeout(() => {
						if (internalState === 'success') internalState = 'idle';
					}, successHoldMs);
				}
			} catch {
				internalState = 'idle';
			}
		} else {
			onclick?.(e);
		}
	}

	const variantClasses: Record<Variant, string> = {
		default: 'bg-primary text-primary-foreground hover:bg-primary/90',
		destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
		outline: 'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
		secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
		ghost: 'hover:bg-accent hover:text-accent-foreground'
	};

	const sizeClasses: Record<Size, string> = {
		default: 'h-11 px-4 py-2 text-sm',
		sm: 'h-9 rounded-md px-3 text-xs',
		lg: 'h-12 rounded-md px-8 text-base'
	};

	const successClasses =
		'bg-[hsl(var(--status-active))] text-white hover:bg-[hsl(var(--status-active))] border-transparent';

	const activeLabel = $derived(
		current === 'loading' ? (loadingLabel ?? label) : current === 'success' ? (successLabel ?? label) : label
	);
</script>

<button
	{type}
	disabled={disabled || isBusy}
	onclick={handleClick}
	aria-live="polite"
	aria-busy={current === 'loading'}
	class={cn(
		'relative inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg font-semibold ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none cursor-pointer overflow-hidden',
		current === 'success' ? successClasses : variantClasses[variant],
		sizeClasses[size],
		isBusy ? 'disabled:opacity-100' : 'disabled:opacity-50',
		className
	)}
	{...rest}
>
	<!-- Width-locking ghost: idle layout always rendered, invisible when busy -->
	<span class={cn('inline-flex items-center gap-2', current !== 'idle' && 'invisible')}>
		{#if icon}{@render icon()}{/if}
		{label}
	</span>

	{#if current === 'loading'}
		<span class="absolute inset-0 flex items-center justify-center gap-2">
			<Loader2 class="h-4 w-4 animate-spool-up" />
			<span>{activeLabel}</span>
		</span>
	{:else if current === 'success'}
		<span class="absolute inset-0 flex items-center justify-center gap-2">
			<Check class="h-4 w-4 animate-pop-in" strokeWidth={3} />
			<span>{activeLabel}</span>
		</span>
	{/if}
</button>
