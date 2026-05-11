<script lang="ts">
	import { cn } from '$lib/utils/cn';

	let {
		title,
		subtitle,
		actions,
		children,
		class: className
	}: {
		title?: string;
		subtitle?: string;
		actions?: import('svelte').Snippet;
		children?: import('svelte').Snippet;
		class?: string;
	} = $props();
</script>

<div class={cn('mx-auto w-full max-w-screen-xl px-4 py-4 md:px-8 md:py-8', className)}>
	{#if title || actions}
		<header class="mb-6 flex flex-col gap-2 md:mb-8 md:flex-row md:items-start md:justify-between">
			<div class="flex flex-col gap-1">
				{#if title}
					<h1 class="text-2xl font-semibold leading-tight text-foreground md:text-3xl">
						{title}
					</h1>
				{/if}
				{#if subtitle}
					<p class="text-sm text-muted-foreground">{subtitle}</p>
				{/if}
			</div>
			{#if actions}
				<div class="flex flex-wrap items-center gap-2">
					{@render actions()}
				</div>
			{/if}
		</header>
	{/if}
	{@render children?.()}
</div>
