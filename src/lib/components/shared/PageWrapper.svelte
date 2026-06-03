<script lang="ts">
	import { cn } from '$lib/utils/cn';
	import { goto } from '$app/navigation';
	import { ArrowLeft } from '@lucide/svelte';

	let {
		title,
		subtitle,
		actions,
		back,
		children,
		class: className
	}: {
		title?: string;
		subtitle?: string;
		actions?: import('svelte').Snippet;
		/** Show a back button to the left of the title. `true` uses history.back(); a string is a route to goto. */
		back?: boolean | string;
		children?: import('svelte').Snippet;
		class?: string;
	} = $props();

	function handleBack() {
		if (typeof back === 'string') {
			void goto(back);
		} else if (typeof history !== 'undefined' && history.length > 1) {
			history.back();
		} else {
			void goto('/');
		}
	}
</script>

<div class={cn('mx-auto w-full max-w-screen-xl px-4 py-4 md:px-6 md:py-6', className)}>
	{#if title || actions || back}
		<header
			class="-mx-4 mb-5 flex min-h-14 flex-col gap-3 border-b border-border/60 bg-background px-4 pb-4 md:-mx-6 md:sticky md:top-14 md:z-30 md:mb-6 md:min-h-16 md:flex-row md:items-center md:justify-between md:px-6 md:py-3"
		>
			<div class="flex min-w-0 items-center gap-3">
				{#if back}
					<button
						type="button"
						onclick={handleBack}
						aria-label="Go back"
						class="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border/70 bg-card text-foreground shadow-card transition-all duration-150 ease-out hover:-translate-x-0.5 hover:border-primary/30 hover:bg-card-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					>
						<ArrowLeft class="h-4 w-4" />
					</button>
				{/if}
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
