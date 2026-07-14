<script lang="ts">
	let {
		message,
		variant = 'destructive'
	}: {
		message: string;
		variant?: 'destructive' | 'success' | 'default';
	} = $props();

	const icons = {
		destructive: `<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>`,
		success: `<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>`,
		default: `<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>`
	};
</script>

<div role="alert" class="auth-alert auth-alert--{variant}">
	<svg
		xmlns="http://www.w3.org/2000/svg"
		width="16"
		height="16"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		stroke-width="2"
		stroke-linecap="round"
		stroke-linejoin="round"
		class="auth-alert__icon"
		aria-hidden="true"
	>
		<!-- eslint-disable-next-line svelte/no-at-html-tags -->
		{@html icons[variant]}
	</svg>
	<p class="auth-alert__message">{message}</p>
</div>

<style lang="scss">
	@use '$lib/styles/tokens' as *;

	.auth-alert {
		display: flex;
		align-items: flex-start;
		gap: $space-3;
		border-radius: $radius-md;
		border: 1px solid transparent;
		padding: $space-3 $space-4;
		font-size: $fs-body;
		line-height: $lh-body;

		&--destructive {
			border-color: rgba(225, 29, 72, 0.3);
			background: var(--danger-bg);
			color: var(--danger-text);
		}

		&--success {
			border-color: rgba(34, 125, 83, 0.3);
			background: var(--success-bg);
			color: var(--success-text);
		}

		&--default {
			border-color: var(--color-border-strong);
			background: var(--color-bg-surface-sunk);
			color: var(--color-text-primary);
		}
	}

	.auth-alert__icon {
		margin-top: 1px;
		flex-shrink: 0;
	}

	.auth-alert__message {
		line-height: $lh-body;
	}
</style>
