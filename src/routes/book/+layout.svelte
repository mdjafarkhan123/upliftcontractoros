<script lang="ts">
	import '$lib/styles/app.scss';

	let { children } = $props();
</script>

<svelte:head>
	<meta name="robots" content="noindex, nofollow" />
	<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
</svelte:head>

<div class="book-layout">
	<div aria-hidden="true" class="book-layout__glow"></div>
	<div aria-hidden="true" class="book-layout__fade"></div>
	{@render children?.()}
</div>
