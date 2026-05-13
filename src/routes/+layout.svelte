<script lang="ts">
	import '$lib/styles/app.css';
	import '$lib/stores/theme.svelte';

	let { children } = $props();
</script>

<svelte:head>
	<script>
		(function () {
			try {
				var stored = localStorage.getItem('cos-theme');
				var theme =
					stored === 'light' || stored === 'dark'
						? stored
						: window.matchMedia('(prefers-color-scheme: light)').matches
							? 'light'
							: 'dark';
				if (theme === 'light') document.documentElement.classList.add('light');
				document.documentElement.style.colorScheme = theme;
			} catch (e) {}
		})();
	</script>
</svelte:head>

{@render children()}
