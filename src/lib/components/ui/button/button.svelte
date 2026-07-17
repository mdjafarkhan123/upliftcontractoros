<script lang="ts">
	import type { HTMLButtonAttributes } from 'svelte/elements';
	import type { Snippet } from 'svelte';

	type Variant =
		| 'default'
		| 'destructive'
		| 'danger-outline'
		| 'outline'
		| 'secondary'
		| 'ghost'
		| 'link';
	type Size = 'default' | 'sm' | 'lg' | 'icon';
	type State = 'idle' | 'loading' | 'success';

	let {
		class: className = '',
		variant = 'default' as Variant,
		size = 'default' as Size,
		disabled = false,
		type = 'button' as HTMLButtonAttributes['type'],
		href,
		loading = false,
		success = false,
		onAction,
		loadingLabel,
		successLabel,
		successHoldMs = 1400,
		icon,
		onclick,
		children,
		...rest
	}: {
		class?: string;
		variant?: Variant;
		size?: Size;
		disabled?: boolean;
		type?: HTMLButtonAttributes['type'];
		href?: string;
		loading?: boolean;
		success?: boolean;
		onAction?: (e: MouseEvent) => Promise<void> | void;
		loadingLabel?: string;
		successLabel?: string;
		successHoldMs?: number;
		icon?: Snippet;
		onclick?: (e: MouseEvent) => void;
		children?: Snippet;
		[key: string]: unknown;
	} = $props();

	let internalState: State = $state('idle');
	const usingAction = $derived(!!onAction);

	const current: State = $derived(
		usingAction ? internalState : loading ? 'loading' : success ? 'success' : 'idle'
	);
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

	const variantModifier: Record<Variant, string> = {
		default: 'btn--primary',
		destructive: 'btn--danger',
		'danger-outline': 'btn--danger-outline',
		outline: 'btn--outline',
		secondary: 'btn--secondary',
		ghost: 'btn--ghost',
		link: 'btn--link'
	};

	const sizeModifier: Record<Size, string> = {
		default: '',
		sm: 'btn--sm',
		lg: 'btn--lg',
		icon: 'btn--icon'
	};

	const classes = $derived(
		[
			'btn',
			variantModifier[variant],
			sizeModifier[size],
			current === 'success' ? 'btn--success' : '',
			className
		]
			.filter(Boolean)
			.join(' ')
	);
</script>

{#if href}
	<a {href} class={classes} {...rest}>
		{#if icon}{@render icon()}{/if}
		{@render children?.()}
	</a>
{:else}
	<button
		{type}
		disabled={disabled || isBusy}
		onclick={handleClick}
		aria-live="polite"
		aria-busy={current === 'loading'}
		class={classes}
		{...rest}
	>
		<span class="btn__content" style:display={isBusy ? 'none' : null}>
			{#if icon && current === 'idle'}{@render icon()}{/if}
			{@render children?.()}
		</span>

		{#if current === 'loading' || current === 'success'}
			<span class="btn__overlay">
				{#if current === 'loading'}
					<i class="ri-loader-4-line btn__spin" aria-hidden="true"></i>
					{#if loadingLabel}<span>{loadingLabel}</span>{/if}
				{:else}
					<i class="ri-check-line" aria-hidden="true"></i>
					{#if successLabel}<span>{successLabel}</span>{/if}
				{/if}
			</span>
		{/if}
	</button>
{/if}

<style lang="scss">
	@use '$lib/styles/tokens' as *;

	.btn__content {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: $space-2;
		white-space: nowrap;
	}

	.btn__overlay {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: $space-2;
		white-space: nowrap;
	}

	.btn__spin {
		font-size: 1.6rem;
		animation: btn-spin 0.7s linear infinite;
	}

	@keyframes btn-spin {
		to {
			transform: rotate(360deg);
		}
	}
</style>