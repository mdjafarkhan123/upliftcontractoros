<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import type { Component } from 'svelte';

	let {
		title,
		description,
		actionLabel,
		onAction,
		icon: Icon
	}: {
		title: string;
		description?: string;
		actionLabel?: string;
		onAction?: () => void;
		icon?: Component;
	} = $props();
</script>

<div
	class="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-card/50 px-6 py-12 text-center"
>
	{#if Icon}
		<div class="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
			<Icon class="h-6 w-6" />
		</div>
	{/if}
	<h3 class="text-base font-semibold text-foreground">{title}</h3>
	{#if description}
		<p class="max-w-sm text-sm text-muted-foreground">{description}</p>
	{/if}
	{#if actionLabel && onAction}
		<Button class="mt-2" onclick={onAction}>{actionLabel}</Button>
	{/if}
</div>
