<!--
  Route-transition overlay loader.
  Reuses the global .app-loader classes defined inline in app.html.
  Semi-transparent so the previous page stays visible underneath —
  communicates "transitioning", not "reloading the app".
-->
<script lang="ts">
	import { appLoading } from '$lib/stores/app-loading.svelte';
</script>

{#if appLoading.isOverlayLoading}
	<div
		class="app-loader app-loader--overlay"
		role="status"
		aria-busy="true"
		aria-live="polite"
		aria-label="Loading page"
	>
		<div class="app-loader__mark">
			<div class="app-loader__ring"></div>
			<div class="app-loader__pulse"></div>
		</div>
		<div class="app-loader__label">Loading…</div>
		<div class="app-loader__bar"><div class="app-loader__bar-fill"></div></div>
	</div>
{/if}
