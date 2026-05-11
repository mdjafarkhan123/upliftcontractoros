<script lang="ts">
</script>

<svelte:head>
	<title>Account Suspended — Contractor OS</title>
</svelte:head>

<main class="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-50/40 flex items-center justify-center p-4">
	<div class="w-full max-w-[420px]">
		<!-- Brand header -->
		<div class="text-center mb-8">
			<p class="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground/70">
				Contractor OS
			</p>
		</div>

		<div class="bg-white rounded-2xl shadow-xl shadow-slate-200/80 border border-slate-200/60 overflow-hidden">
			<div class="px-8 py-12 text-center">
				<div
					class="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-red-100"
					aria-hidden="true"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="28"
						height="28"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
						class="text-red-500"
					>
						<circle cx="12" cy="12" r="10" />
						<line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
					</svg>
				</div>

				<h1 class="text-2xl font-bold text-foreground">Account Suspended</h1>
				<p class="mt-3 text-sm text-muted-foreground leading-relaxed max-w-[280px] mx-auto">
					Your account has been temporarily suspended. Please contact your account manager to
					resolve this issue.
				</p>

				<div class="mt-8 space-y-3">
					<a
						href="/auth/logout"
						class="flex w-full items-center justify-center h-11 rounded-xl bg-destructive text-sm font-semibold text-white shadow-md shadow-destructive/20 hover:bg-destructive/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/50 focus-visible:ring-offset-2 transition-all duration-150"
					>
						Sign out
					</a>
				</div>
			</div>
		</div>

		<p class="text-center text-xs text-muted-foreground/50 mt-6">
			© {new Date().getFullYear()} Contractor OS. All rights reserved.
		</p>
	</div>
</main>
