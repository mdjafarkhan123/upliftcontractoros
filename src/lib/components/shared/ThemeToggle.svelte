<script lang="ts">
	import { theme } from '$lib/stores/theme.svelte';

	let { class: className = '' }: { class?: string } = $props();
</script>

<button
	type="button"
	onclick={() => theme.toggle()}
	class="topbar__icon-btn {className}"
	aria-label={theme.value === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
	title={theme.value === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
>
	{#if theme.value === 'dark'}
		<i class="ri-sun-line" aria-hidden="true"></i>
	{:else}
		<i class="ri-moon-line" aria-hidden="true"></i>
	{/if}
</button>
