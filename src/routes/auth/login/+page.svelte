<script lang="ts">
	import { enhance } from '$app/forms';
	import AuthCard from '$lib/components/auth/AuthCard.svelte';
	import AuthAlert from '$lib/components/auth/AuthAlert.svelte';
	import AuthField from '$lib/components/auth/AuthField.svelte';

	let { data, form }: {
		data: { errorMessage: string | null };
		form?: { error?: string; email?: string };
	} = $props();

	let loading = $state(false);
	let visibleError = $derived(form?.error ?? data.errorMessage);
	let emailValue = $derived(form?.email ?? '');
</script>

<svelte:head>
	<title>Sign In — Contractor OS</title>
</svelte:head>

<AuthCard title="Welcome back" description="Sign in to your Contractor OS account.">
	{#snippet children()}
		{#if visibleError}
			<div class="mb-5">
				<AuthAlert message={visibleError} variant="destructive" />
			</div>
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
			<AuthField
				id="email"
				label="Email address"
				type="email"
				autocomplete="username"
				value={emailValue}
				placeholder="you@example.com"
				required
			/>

			<div class="space-y-1.5">
				<div class="flex items-center justify-between">
					<label for="password" class="block text-sm font-semibold text-foreground/80">
						Password
					</label>
					<a
						href="/auth/forgot-password"
						class="text-xs font-medium text-primary hover:text-primary/80 transition-colors"
					>
						Forgot password?
					</a>
				</div>
				<input
					id="password"
					name="password"
					type="password"
					autocomplete="current-password"
					placeholder="••••••••"
					required
					class="flex h-11 w-full rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/60 focus:bg-white transition-all duration-150"
				/>
			</div>

			<button
				type="submit"
				disabled={loading}
				class="w-full h-11 rounded-xl bg-primary text-sm font-semibold text-white shadow-md shadow-primary/20 hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed transition-all duration-150 cursor-pointer"
			>
				{#if loading}
					<span class="inline-flex items-center gap-2">
						<svg class="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
							<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
							<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
						</svg>
						Signing in…
					</span>
				{:else}
					Sign in
				{/if}
			</button>
		</form>
	{/snippet}
</AuthCard>
