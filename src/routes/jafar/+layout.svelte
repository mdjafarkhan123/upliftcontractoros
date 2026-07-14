<script lang="ts">
	import { page } from '$app/state';

	let { children } = $props();

	const isLoginPage = $derived(page.route.id === '/jafar');
</script>

{#if isLoginPage}
	{@render children()}
{:else}
	<div class="jafar-shell">
		<header class="jafar-header">
			<div class="jafar-header__inner">
				<a href="/jafar/dashboard" class="jafar-header__brand">
					<div class="jafar-header__logo">
						<i class="ri-lock-line" aria-hidden="true"></i>
					</div>
					<div class="jafar-header__wordmark">
						<span class="jafar-header__eyebrow">Platform Owner</span>
						<span class="jafar-header__app">Contractor OS</span>
					</div>
				</a>

				<form method="POST" action="/jafar/logout">
					<button type="submit" class="jafar-header__logout">
						<i class="ri-logout-box-r-line" aria-hidden="true"></i>
						Sign out
					</button>
				</form>
			</div>
		</header>

		<main class="jafar-main">
			{@render children()}
		</main>
	</div>
{/if}
