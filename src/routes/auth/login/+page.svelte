<script lang="ts">
	import { enhance } from '$app/forms';
	import AuthCard from '$lib/components/auth/AuthCard.svelte';
	import AuthAlert from '$lib/components/auth/AuthAlert.svelte';
	import AuthField from '$lib/components/auth/AuthField.svelte';

	let {
		data,
		form
	}: {
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

			<AuthField
				id="password"
				label="Password"
				type="password"
				autocomplete="current-password"
				placeholder="••••••••"
				required
			>
				{#snippet trailing()}
					<a
						href="/auth/forgot-password"
						class="text-xs font-medium text-primary transition-colors hover:text-primary/80"
					>
						Forgot password?
					</a>
				{/snippet}
			</AuthField>

			<button
				type="submit"
				disabled={loading}
				class="group relative inline-flex h-11 w-full items-center justify-center overflow-hidden rounded-xl text-sm font-semibold text-white shadow-lg shadow-primary/30 transition-all duration-150 hover:shadow-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-60"
				style="background: linear-gradient(135deg, hsl(var(--brand-primary)) 0%, hsl(var(--brand-deep)) 100%);"
			>
				<span
					class="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-200 group-hover:opacity-100"
					style="background: linear-gradient(135deg, hsl(var(--brand-light)) 0%, hsl(var(--brand-primary)) 100%);"
				></span>
				<span class="relative inline-flex items-center gap-2">
					{#if loading}
						<svg
							class="h-4 w-4 animate-spin"
							xmlns="http://www.w3.org/2000/svg"
							fill="none"
							viewBox="0 0 24 24"
						>
							<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"
							></circle>
							<path
								class="opacity-75"
								fill="currentColor"
								d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
							></path>
						</svg>
						Signing in…
					{:else}
						Sign in
						<svg
							xmlns="http://www.w3.org/2000/svg"
							width="14"
							height="14"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2.5"
							stroke-linecap="round"
							stroke-linejoin="round"
							class="transition-transform duration-150 group-hover:translate-x-0.5"
						>
							<path d="M5 12h14" />
							<path d="m12 5 7 7-7 7" />
						</svg>
					{/if}
				</span>
			</button>
		</form>
	{/snippet}

	{#snippet footer()}
		<p class="text-xs text-muted-foreground">
			Need an account? <span class="font-medium text-foreground">Contact your administrator.</span>
		</p>
	{/snippet}
</AuthCard>
