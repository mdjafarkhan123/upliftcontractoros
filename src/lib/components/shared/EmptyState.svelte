<script lang="ts">
	let {
		title,
		description,
		actionLabel,
		onAction,
		iconClass
	}: {
		title: string;
		description?: string;
		actionLabel?: string;
		onAction?: () => void;
		iconClass?: string;
	} = $props();
</script>

<div class="empty-state">
	{#if iconClass}
		<div class="empty-state__icon">
			<i class={iconClass} aria-hidden="true"></i>
		</div>
	{/if}
	<h3 class="empty-state__title">{title}</h3>
	{#if description}
		<p class="empty-state__text">{description}</p>
	{/if}
	{#if actionLabel && onAction}
		<button type="button" class="btn btn--primary empty-state__action" onclick={onAction}>
			{actionLabel}
		</button>
	{/if}
</div>

<style lang="scss">
	@use '$lib/styles/tokens' as *;

	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: $space-3;
		padding: $space-12 $space-6;
		text-align: center;
		border: 1px dashed var(--color-border-strong);
		border-radius: $radius-lg;
		background-color: var(--color-bg-surface-sunk);

		&__icon {
			display: flex;
			align-items: center;
			justify-content: center;
			width: 48px;
			height: 48px;
			border-radius: $radius-md;
			color: var(--color-text-secondary);
			background-color: var(--color-bg-surface);
			box-shadow: inset 0 0 0 1px var(--color-border);

			i {
				font-size: 2.4rem;
			}
		}

		&__title {
			font-size: $fs-lg;
			font-weight: $weight-semibold;
			color: var(--color-text-primary);
		}

		&__text {
			max-width: 384px;
			font-size: $fs-body;
			color: var(--color-text-secondary);
		}

		&__action {
			margin-top: $space-2;
		}
	}
</style>
