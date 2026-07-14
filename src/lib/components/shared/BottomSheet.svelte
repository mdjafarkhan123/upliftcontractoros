<script lang="ts">
	import * as Sheet from '$lib/components/ui/sheet';

	let {
		open = $bindable(false),
		title,
		description,
		children
	}: {
		open?: boolean;
		title?: string;
		description?: string;
		children?: import('svelte').Snippet;
	} = $props();
</script>

<Sheet.Root bind:open>
	<Sheet.Content side="bottom">
		{#if title}
			<Sheet.Header>
				<Sheet.Title>{title}</Sheet.Title>
				{#if description}
					<p class="bottom-sheet__desc">{description}</p>
				{/if}
			</Sheet.Header>
		{/if}
		{@render children?.()}
	</Sheet.Content>
</Sheet.Root>

<style lang="scss">
	@use '$lib/styles/tokens' as *;

	.bottom-sheet__desc {
		font-size: $fs-body;
		color: var(--color-text-secondary);
		margin: 0;
	}
</style>
