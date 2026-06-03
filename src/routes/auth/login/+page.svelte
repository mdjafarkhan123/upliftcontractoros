<script lang="ts">
	import { enhance } from '$app/forms';
	import AuthCard from '$lib/components/auth/AuthCard.svelte';
	import AuthAlert from '$lib/components/auth/AuthAlert.svelte';
	import AuthField from '$lib/components/auth/AuthField.svelte';
	import { Button } from '$lib/components/ui/button';

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

			<Button type="submit" size="lg" disabled={loading} class="h-11 w-full text-sm font-semibold">
				{#snippet children()}
					{#if loading}
						<svg
							class="h-4 w-4 animate-spin"
							xmlns="http://www.w3.org/2000/svg"
							fill="none"
							viewBox="0 0 24 24"
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
				{/snippet}
			</Button>
		</form>
	{/snippet}

	{#snippet footer()}
		<p class="text-xs text-muted-foreground">
			Need an account? <span class="font-medium text-foreground">Contact your administrator.</span>
		</p>
	{/snippet}
</AuthCard>
