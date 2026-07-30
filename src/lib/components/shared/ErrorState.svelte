<script lang="ts">
	let {
		title = 'Something went wrong',
		message,
		onRetry
	}: {
		title?: string;
		message?: string | null;
		onRetry?: () => void;
	} = $props();
</script>

<div class="error-state">
	<div class="error-state__icon">
		<i class="ri-alert-line" aria-hidden="true"></i>
	</div>
	<p class="error-state__title">{title}</p>
	{#if message}
		<p class="error-state__message">{message}</p>
	{/if}
	{#if onRetry}
		<button type="button" class="btn btn--ghost error-state__retry" onclick={onRetry}>
			Try again
		</button>
	{/if}
</div>

<style lang="scss">
	@use '$lib/styles/tokens' as *;

	.error-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: $space-2;
		padding: $space-8 $space-6;
		border-radius: $radius-2xl;
		border: 1px solid var(--danger-bg);
		background: var(--danger-bg);
		text-align: center;

		&__icon {
			display: flex;
			align-items: center;
			justify-content: center;
			width: 40px;
			height: 40px;
			border-radius: $radius-md;
			background: var(--color-bg-app);
			color: var(--danger-solid);

			i {
				font-size: 2rem;
			}
		}

		&__title {
			font-size: $fs-body;
			font-weight: $weight-medium;
			color: var(--danger-text);
		}

		&__message {
			font-size: $fs-body;
			color: var(--color-text-muted);
		}

		&__retry {
			margin-top: $space-1;
			font-size: $fs-body;
			color: var(--color-brand);
		}
	}
</style>
