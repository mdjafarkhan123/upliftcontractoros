<script lang="ts">
	import { enhance } from '$app/forms';
	import AuthCard from '$lib/components/auth/AuthCard.svelte';
	import AuthAlert from '$lib/components/auth/AuthAlert.svelte';
	import AuthField from '$lib/components/auth/AuthField.svelte';

	let { form }: {
		form?: { error?: string; success?: string; email?: string };
	} = $props();

	let loading = $state(false);
	let emailValue = $derived(form?.email ?? '');
	let sent = $derived(!!form?.success);
</script>

<svelte:head>
	<title>Reset Password — Contractor OS</title>
</svelte:head>

<AuthCard
	title="Reset your password"
	description="Enter your email and we'll send you a link to reset your password."
>
	{#snippet children()}
		{#if form?.error}
			<div class="mb-5">
				<AuthAlert message={form.error} variant="destructive" />
			</div>
		{/if}

		{#if sent}
			<div class="text-center py-4">
				<div
					class="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/15 ring-1 ring-primary/30"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="24"
						height="24"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
						class="text-primary"
					>
						<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
						<polyline points="22 4 12 14.01 9 11.01" />
					</svg>
				</div>
				<h2 class="text-base font-semibold text-foreground">Check your email</h2>
				<p class="mt-1.5 text-sm text-muted-foreground leading-relaxed">
					We've sent a reset link to <span class="font-medium text-foreground">{emailValue || 'your email'}</span>.
					Check your inbox and follow the instructions.
				</p>
			</div>
		{:else}
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

				<button
					type="submit"
					disabled={loading}
					class="group relative inline-flex h-11 w-full items-center justify-center overflow-hidden rounded-xl text-sm font-semibold text-white shadow-lg shadow-primary/30 transition-all duration-150 hover:shadow-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-60"
					style="background: linear-gradient(135deg, hsl(var(--brand-primary)) 0%, hsl(var(--brand-deep)) 100%);"
				>
					{#if loading}
						<span class="inline-flex items-center justify-center gap-2">
							<svg class="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
								<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
								<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
							</svg>
							Sending…
						</span>
					{:else}
						Send reset link
					{/if}
				</button>
			</form>
		{/if}
	{/snippet}

	{#snippet footer()}
		<a
			href="/auth/login"
			class="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors min-h-[44px]"
		>
			<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
				<path d="m15 18-6-6 6-6"/>
			</svg>
			Back to sign in
		</a>
	{/snippet}
</AuthCard>
