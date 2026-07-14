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
		// --- loading / state ---
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
		/** Controlled busy state — you own it (set true before the request, false after). */
		loading?: boolean;
		/** Controlled success state — shows a checkmark. Ignored while `onAction` is managing state. */
		success?: boolean;
		/** Self-managing async handler: idle → loading (awaits) → success flash → idle. */
		onAction?: (e: MouseEvent) => Promise<void> | void;
		/** Optional text shown next to the spinner while loading (falls back to the normal content). */
		loadingLabel?: string;
		/** Optional text shown next to the checkmark on success. */
		successLabel?: string;
		successHoldMs?: number;
		/** Optional leading icon snippet, rendered only in the idle state. */
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
		<!-- Width-locking content: always rendered so the button never resizes; hidden when busy -->
		<span class="btn__content" style:visibility={isBusy ? 'hidden' : null}>
			{#if icon && current === 'idle'}{@render icon()}{/if}
			{@render children?.()}
		</span>

		{#if current === 'loading'}
			<span class="btn__overlay">
				<i class="ri-loader-4-line btn__spin" aria-hidden="true"></i>
				{#if loadingLabel}<span>{loadingLabel}</span>{/if}
			</span>
		{:else if current === 'success'}
			<span class="btn__overlay">
				<i class="ri-check-line" aria-hidden="true"></i>
				{#if successLabel}<span>{successLabel}</span>{/if}
			</span>
		{/if}
	</button>
{/if}

<style lang="scss">
	@use '$lib/styles/tokens' as *;

	.btn__content {
		display: inline-flex;
		align-items: center;
		gap: $space-2;
		white-space: nowrap;
	}

	.btn__overlay {
		position: absolute;
		inset: 0;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: $space-2;
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
