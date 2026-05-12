<script lang="ts">
	import { page } from '$app/state';

	let { children } = $props();

	const isLoginPage = $derived(page.route.id === '/jafar');
</script>

{#if isLoginPage}
	{@render children()}
{:else}
	<div class="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-100">
		<header class="border-b border-slate-800/80 bg-slate-950/60 backdrop-blur">
			<div class="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
				<a href="/jafar/dashboard" class="flex items-center gap-2.5 group">
					<div
						class="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-red-500 to-red-600 shadow-md shadow-red-900/40 ring-1 ring-red-400/30"
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							width="16"
							height="16"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2.4"
							stroke-linecap="round"
							stroke-linejoin="round"
							class="text-white"
							aria-hidden="true"
						>
							<rect x="3" y="11" width="18" height="11" rx="2" />
							<path d="M7 11V7a5 5 0 0 1 10 0v4" />
						</svg>
					</div>
					<div class="leading-tight">
						<p class="text-[10px] font-bold uppercase tracking-[0.24em] text-red-400/90">
							Platform Owner
						</p>
						<p class="text-xs font-medium text-slate-400 group-hover:text-slate-300 transition-colors">
							Contractor OS
						</p>
					</div>
				</a>

				<form method="POST" action="/jafar/logout">
					<button
						type="submit"
						class="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900/60 px-3 text-xs font-semibold text-slate-300 hover:border-slate-600 hover:bg-slate-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/40 transition-colors cursor-pointer"
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							width="14"
							height="14"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
							aria-hidden="true"
						>
							<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
							<polyline points="16 17 21 12 16 7" />
							<line x1="21" y1="12" x2="9" y2="12" />
						</svg>
						Sign out
					</button>
				</form>
			</div>
		</header>

		<main class="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
			{@render children()}
		</main>
	</div>
{/if}
