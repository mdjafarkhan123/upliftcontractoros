<script lang="ts">
	import { fly, fade } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import { toast, type ToastVariant } from '$lib/stores/toast.svelte';

	const ACCENT: Record<ToastVariant, { icon: string; color: string }> = {
		success: { icon: 'ri-checkbox-circle-fill', color: 'var(--success-solid)' },
		error: { icon: 'ri-error-warning-fill', color: 'var(--danger-solid)' },
		info: { icon: 'ri-information-fill', color: '#3b82f6' }
	};
</script>

<!-- Top-center on all screens: always in the contractor's field of view, never buried under sheets or nav -->
<div class="toaster" aria-live="polite" aria-atomic="false">
	{#each toast.items as t (t.id)}
		{@const a = ACCENT[t.variant]}
		<div
			class="toaster__toast"
			in:fly={{ y: -10, duration: 200, easing: cubicOut }}
			out:fade={{ duration: 150 }}
			role={t.variant === 'error' ? 'alert' : 'status'}
		>
			<!-- Accent stripe -->
			<span class="toaster__bar" style="background: {a.color}"></span>

			<!-- Content -->
			<div class="toaster__content">
				<i class="{a.icon} toaster__icon" style="color: {a.color}" aria-hidden="true"></i>
				<div class="toaster__text">
					<p class="toaster__message">{t.message}</p>
					{#if t.description}
						<p class="toaster__desc">{t.description}</p>
					{/if}
					{#if t.action}
						{#if 'href' in t.action}
							<a
								class="toaster__action"
								style="color: {a.color}"
								href={t.action.href}
								onclick={() => toast.dismiss(t.id)}
							>
								{t.action.label}
								<i
									class="{t.action.icon ?? 'ri-arrow-right-line'} toaster__action-arrow"
									aria-hidden="true"
								></i>
							</a>
						{:else}
							{@const onClick = t.action.onClick}
							<button
								type="button"
								class="toaster__action"
								style="color: {a.color}"
								onclick={() => {
									onClick();
									toast.dismiss(t.id);
								}}
							>
								<i
									class="{t.action.icon ?? 'ri-arrow-go-back-line'} toaster__action-arrow"
									aria-hidden="true"
								></i>
								{t.action.label}
							</button>
						{/if}
					{/if}
				</div>
				<button
					type="button"
					class="toaster__close"
					onclick={() => toast.dismiss(t.id)}
					aria-label="Dismiss notification"
				>
					<i class="ri-close-line toaster__close-icon" aria-hidden="true"></i>
				</button>
			</div>
		</div>
	{/each}
</div>

<style lang="scss">
	@use '$lib/styles/tokens' as *;

	.toaster {
		position: fixed;
		inset-inline: 0;
		top: $space-4;
		z-index: $z-toast;
		display: flex;
		flex-direction: column;
		gap: $space-2;
		padding: 0 $space-4;
		pointer-events: none;
		isolation: isolate;

		@media (min-width: 768px) {
			left: 50%;
			transform: translateX(-50%);
			width: 100%;
			max-width: 400px;
			padding: 0;
		}

		&__toast {
			display: flex;
			align-items: stretch;
			overflow: hidden;
			border: 1px solid var(--color-border);
			border-radius: $radius-xl;
			background: var(--color-bg-surface);
			box-shadow: var(--shadow-xl);
			pointer-events: auto;
		}

		&__bar {
			width: 4px;
			flex-shrink: 0;
		}

		&__content {
			display: flex;
			align-items: flex-start;
			gap: $space-3;
			min-width: 0;
			flex: 1;
			padding: 14px $space-4;
		}

		&__icon {
			margin-top: 1px;
			flex-shrink: 0;
			font-size: 16px;
		}

		&__text {
			min-width: 0;
			flex: 1;
		}

		&__message {
			margin: 0;
			font-size: $fs-body;
			font-weight: $weight-semibold;
			line-height: 1.4;
			color: var(--color-text-primary);
		}

		&__desc {
			margin: 2px 0 0;
			font-size: $fs-caption;
			line-height: 1.4;
			color: var(--color-text-muted);
		}

		&__action {
			display: inline-flex;
			align-items: center;
			gap: $space-1;
			margin-top: 10px;
			padding: 0;
			border: none;
			background: none;
			font-family: inherit;
			font-size: $fs-caption;
			font-weight: $weight-semibold;
			text-underline-offset: 2px;
			cursor: pointer;

			&:hover {
				text-decoration: underline;
			}
		}

		&__action-arrow {
			flex-shrink: 0;
			font-size: 12px;
		}

		&__close {
			display: inline-flex;
			align-items: center;
			justify-content: center;
			flex-shrink: 0;
			width: 24px;
			height: 24px;
			margin: -2px -4px 0 $space-1;
			border: none;
			border-radius: $radius-md;
			background: transparent;
			color: var(--color-text-muted);
			cursor: pointer;
			transition:
				background-color $duration-fast $ease-standard,
				color $duration-fast $ease-standard;

			&:hover {
				background: var(--color-bg-surface-sunk);
				color: var(--color-text-primary);
			}
		}

		&__close-icon {
			font-size: 14px;
		}
	}
</style>
