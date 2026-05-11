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
					<p class="text-sm text-muted-foreground">{description}</p>
				{/if}
			</Sheet.Header>
		{/if}
		{@render children?.()}
	</Sheet.Content>
</Sheet.Root>
