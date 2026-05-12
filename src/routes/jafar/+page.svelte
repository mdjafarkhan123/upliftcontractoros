<script lang="ts">
	import { enhance } from '$app/forms';
	import AuthAlert from '$lib/components/auth/AuthAlert.svelte';
	import AuthField from '$lib/components/auth/AuthField.svelte';

	let {
		data,
		form
	}: {
		data: { errorMessage: string | null };
		form: { errorMessage?: string } | null;
	} = $props();

	let loading = $state(false);

	const errorMessage = $derived(form?.errorMessage ?? data.errorMessage);
</script>

<svelte:head>
	<title>Platform Owner — Restricted Access</title>
</svelte:head>

<main
	class="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center p-4"
>
	<div class="w-full max-w-[440px]">
		<!-- Brand header -->
		<div class="text-center mb-8">
			<div
				class="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-red-500 to-red-600 shadow-lg shadow-red-900/40 mb-5 ring-1 ring-red-400/30"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="26"
					height="26"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2.2"
					stroke-linecap="round"
					stroke-linejoin="round"
					class="text-white"
					aria-hidden="true"
				>
					<rect x="3" y="11" width="18" height="11" rx="2" />
					<path d="M7 11V7a5 5 0 0 1 10 0v4" />
				</svg>
			</div>
			<p class="text-[10px] font-bold uppercase tracking-[0.28em] text-red-400/90">
				Restricted Access
			</p>
			<p class="mt-1 text-xs font-medium uppercase tracking-[0.18em] text-slate-400">
				Contractor OS — Platform Owner
			</p>
		</div>

		<!-- Card -->
		<div
			class="bg-slate-900/70 backdrop-blur rounded-2xl shadow-2xl shadow-black/50 border border-slate-800 overflow-hidden"
		>
			<div class="px-8 pt-8 pb-2">
				<h1 class="text-2xl font-bold tracking-tight text-white">Platform owner sign-in</h1>
				<p class="mt-1.5 text-sm text-slate-400 leading-relaxed">
					This area is isolated from contractor accounts. All attempts are logged and rate-limited.
				</p>
			</div>

			<div class="px-8 py-8 space-y-5">
				{#if errorMessage}
					<AuthAlert message={errorMessage} variant="destructive" />
				{/if}

				<form
					method="POST"
					class="space-y-5"
					use:enhance={() => {
						loading = true;
						return async ({ update }) => {
							await update();
							loading = false;
						};
					}}
				>
					<div class="[&_label]:text-slate-300 [&_input]:bg-slate-950/60 [&_input]:border-slate-700 [&_input]:text-white [&_input]:placeholder:text-slate-500 [&_input:focus]:bg-slate-950 [&_input:focus]:border-red-500/60 [&_input:focus]:ring-red-500/20 space-y-5">
						<AuthField
							id="email"
							label="Email"
							type="email"
							autocomplete="username"
							placeholder="owner@contractoros.com"
							required
						/>

						<AuthField
							id="password"
							label="Password"
							type="password"
							autocomplete="current-password"
							placeholder="••••••••"
							required
						/>

						<div class="space-y-1.5">
							<label for="totp" class="block text-sm font-semibold text-slate-300">
								Authenticator code
							</label>
							<input
								id="totp"
								name="totp"
								inputmode="numeric"
								autocomplete="one-time-code"
								placeholder="123 456"
								maxlength="6"
								pattern="[0-9]*"
								required
								class="flex h-11 w-full rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-2.5 text-sm tracking-[0.4em] font-mono text-white placeholder:text-slate-500 placeholder:tracking-normal placeholder:font-sans focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500/60 focus:bg-slate-950 transition-all duration-150"
							/>
							<p class="text-xs text-slate-500 leading-relaxed pt-0.5">
								6-digit code from your authenticator app (TOTP).
							</p>
						</div>
					</div>

					<button
						type="submit"
						disabled={loading}
						class="w-full h-11 rounded-xl bg-gradient-to-b from-red-500 to-red-600 text-sm font-semibold text-white shadow-md shadow-red-900/40 hover:from-red-500 hover:to-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 disabled:opacity-60 disabled:cursor-not-allowed transition-all duration-150 cursor-pointer"
					>
						{#if loading}
							<span class="inline-flex items-center gap-2">
								<svg
									class="animate-spin h-4 w-4"
									xmlns="http://www.w3.org/2000/svg"
									fill="none"
									viewBox="0 0 24 24"
									aria-hidden="true"
								>
									<circle
										class="opacity-25"
										cx="12"
										cy="12"
										r="10"
										stroke="currentColor"
										stroke-width="4"
									></circle>
									<path
										class="opacity-75"
										fill="currentColor"
										d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
									></path>
								</svg>
								Verifying…
							</span>
						{:else}
							Continue
						{/if}
					</button>
				</form>
			</div>

			<div class="px-8 pb-6 border-t border-slate-800/80 pt-4">
				<p class="text-[11px] text-slate-500 leading-relaxed text-center">
					Not a platform owner?
					<a href="/auth/login" class="text-slate-300 hover:text-white font-medium underline-offset-2 hover:underline transition-colors">
						Contractor sign-in →
					</a>
				</p>
			</div>
		</div>

		<p class="text-center text-[11px] text-slate-600 mt-6">
			© {new Date().getFullYear()} Contractor OS · Internal use only
		</p>
	</div>
</main>
