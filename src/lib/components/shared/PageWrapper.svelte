<script lang="ts">
	import { goto } from '$app/navigation';

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

	// The universal topbar (AppHeader) owns the global controls — search, theme,
	// notifications, user menu — on every breakpoint. This page header only carries
	// the page's own title, subtitle, and page-specific actions.
	const hasHeader = $derived(Boolean(title || subtitle || actions || back));
</script>

<div class={['page', className].filter(Boolean).join(' ')}>
	{#if hasHeader}
		<header class="page-header">
			<div class="page-header__lead">
				{#if back}
					<button type="button" onclick={handleBack} aria-label="Go back" class="page-header__back">
						<i class="ri-arrow-left-line" aria-hidden="true"></i>
					</button>
				{/if}
				<div class="page-header__titles">
					{#if title}
						<h1 class="page-header__title">{title}</h1>
					{/if}
					<!-- {#if subtitle}
						<p class="page-header__subtitle">{subtitle}</p>
					{/if} -->
				</div>
			</div>

			{#if actions}
				<div class="page-header__actions">
					{@render actions()}
				</div>
			{/if}
		</header>
	{/if}
	{@render children?.()}
</div>

<style lang="scss">
	@use '$lib/styles/tokens' as *;

	.page {
		width: 100%;
		padding: $space-4;

		@media (min-width: $bp-tablet) {
			padding: $space-6;
		}
	}
</style>
