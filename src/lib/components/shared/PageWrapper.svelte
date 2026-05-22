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

<div class={cn('mx-auto w-full max-w-screen-xl px-4 py-4 md:px-6 md:py-6', className)}>
	{#if title || actions}
		<header
			class="-mx-4 mb-5 flex min-h-14 flex-col gap-3 border-b border-border/60 bg-background/90 px-4 pb-4 backdrop-blur-md md:-mx-6 md:sticky md:top-14 md:z-30 md:mb-6 md:min-h-16 md:flex-row md:items-center md:justify-between md:px-6 md:py-3"
		>
			<div class="flex min-w-0 flex-col gap-1">
				{#if title}
					<h1
						class="truncate text-xl font-semibold leading-tight tracking-tight text-foreground md:text-2xl"
					>
						{title}
					</h1>
				{/if}
				{#if subtitle}
					<p class="max-w-3xl text-sm text-muted-foreground">{subtitle}</p>
				{/if}
			</div>
			{#if actions}
				<div class="flex shrink-0 flex-wrap items-center gap-2">
					{@render actions()}
				</div>
			{/if}
		</header>
	{/if}
	{@render children?.()}
</div>
