<script lang="ts">
	import '$lib/styles/app.css';

	let { children } = $props();
</script>

<svelte:head>
	<meta name="robots" content="noindex, nofollow" />
	<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
</svelte:head>

<div
	class="relative min-h-screen w-full overflow-x-hidden bg-background font-[Geist,system-ui,sans-serif] text-foreground antialiased"
>
	<!-- Ambient brand glow — subtle, premium -->
	<div
		aria-hidden="true"
		class="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[420px] bg-[radial-gradient(60%_60%_at_50%_0%,hsl(var(--brand-primary)/0.18)_0%,transparent_70%)]"
	></div>
	<div
		aria-hidden="true"
		class="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[180px] bg-[linear-gradient(to_bottom,hsl(var(--background))_0%,transparent_100%)]"
	></div>

	{@render children?.()}
</div>
