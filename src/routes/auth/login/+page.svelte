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
			<div class="login-alert">
				<AuthAlert message={visibleError} variant="destructive" />
			</div>
		{/if}

		<form
			method="POST"
			class="login-form"
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
					<a href="/auth/forgot-password" class="login-form__forgot">
						Forgot password?
					</a>
				{/snippet}
			</AuthField>

			<button type="submit" disabled={loading} class="btn btn--primary login-form__submit">
				{#if loading}
					<svg
						class="animate-spin login-form__spinner"
						xmlns="http://www.w3.org/2000/svg"
						fill="none"
						viewBox="0 0 24 24"
						aria-hidden="true"
					>
						<circle
							cx="12"
							cy="12"
							r="10"
							stroke="currentColor"
							stroke-width="4"
							opacity="0.25"
						></circle>
						<path
							fill="currentColor"
							opacity="0.75"
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
						aria-hidden="true"
					>
						<path d="M5 12h14" />
						<path d="m12 5 7 7-7 7" />
					</svg>
				{/if}
			</button>
		</form>
	{/snippet}

	{#snippet footer()}
		<p class="login-footer">
			Need an account? <span class="login-footer__emphasis">Contact your administrator.</span>
		</p>
	{/snippet}
</AuthCard>

<style lang="scss">
	@use '$lib/styles/tokens' as *;

	.login-alert {
		margin-bottom: $space-5;
	}

	.login-form {
		display: flex;
		flex-direction: column;
		gap: $space-5;
	}

	.login-form__forgot {
		font-size: $fs-caption;
		font-weight: $weight-medium;
		color: var(--color-brand);
		text-decoration: none;
		transition: color $duration-fast $ease-standard;

		&:hover { color: var(--color-brand-strong); }
	}

	.login-form__submit {
		width: 100%;
		height: 44px;
		margin-top: $space-1;
	}

	.login-form__spinner {
		width: 16px;
		height: 16px;
	}

	.login-footer {
		font-size: $fs-caption;
		color: var(--color-text-muted);
	}

	.login-footer__emphasis {
		font-weight: $weight-medium;
		color: var(--color-text-primary);
	}
</style>
