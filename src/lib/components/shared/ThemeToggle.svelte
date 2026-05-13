<script lang="ts">
	import { Moon, Sun } from '@lucide/svelte';
	import { theme } from '$lib/stores/theme.svelte';

	let { class: className = '' }: { class?: string } = $props();
</script>

<button
	type="button"
	onclick={() => theme.toggle()}
	class={`relative inline-flex h-11 w-11 items-center justify-center rounded-full text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${className}`}
	aria-label={theme.value === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
	title={theme.value === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
>
	{#if theme.value === 'dark'}
		<Sun class="h-5 w-5" />
	{:else}
		<Moon class="h-5 w-5" />
	{/if}
</button>
