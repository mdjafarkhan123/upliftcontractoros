<script lang="ts">
	import '$lib/styles/app.scss';
	import 'remixicon/fonts/remixicon.css';
	import '$lib/stores/theme.svelte';
	import { onMount, tick } from 'svelte';
	import { beforeNavigate, afterNavigate } from '$app/navigation';
	import { page } from '$app/state';
	import { sessionStore } from '$lib/stores/session.svelte';
	import { appLoading, isMajorRoute } from '$lib/stores/app-loading.svelte';
	import AppLoader from '$lib/components/shared/AppLoader.svelte';

	let { children } = $props();

	// Arm the 10s deadlock failsafe as soon as the root layout mounts.
	onMount(() => {
		appLoading.armFailsafe();
	});

	// Readiness gate for removing the static boot loader.
	//   - /(app)/* routes: wait until sessionStore resolves
	//   - everything else (jafar, auth, public): mount-stable is enough
	// One tick + one animation frame after readiness avoids login-page
	// flicker and dashboard skeleton flash.
	$effect(() => {
		if (!appLoading.isInitialHydration) return;
		const routeId = page.route.id ?? '';
		const needsSession = routeId.startsWith('/(app)');
		const status = sessionStore.status;
		const sessionResolved = status === 'ready' || status === 'unauthorized' || status === 'error';
		if (needsSession && !sessionResolved) return;

		void (async () => {
			await tick();
			requestAnimationFrame(() => appLoading.completeInitialHydration());
		})();
	});

	// Route transitions — only major sections, only after initial hydration.
	beforeNavigate((nav) => {
		if (appLoading.isInitialHydration) return;
		if (!nav.to) return;
		const to = nav.to.url.pathname;
		const from = nav.from?.url.pathname ?? '';
		if (to === from) return;
		if (!isMajorRoute(to)) return;
		appLoading.startTransition();
	});

	afterNavigate(() => {
		appLoading.stopTransition();
	});
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
				document.documentElement.setAttribute('data-theme', theme);
				document.documentElement.style.colorScheme = theme;
			} catch (e) {}
		})();
	</script>
</svelte:head>

{@render children()}
<AppLoader />
