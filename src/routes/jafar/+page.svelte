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

<main class="jafar-login">
	<div class="jafar-login__wrap">
		<div class="jafar-login__brand">
			<div class="jafar-login__icon">
				<i class="ri-lock-2-line" aria-hidden="true"></i>
			</div>
			<span class="jafar-login__eyebrow">Restricted Access</span>
			<span class="jafar-login__subtitle">Contractor OS — Platform Owner</span>
		</div>

		<div class="jafar-login__card">
			<div class="jafar-login__head">
				<h1 class="jafar-login__title">Platform owner sign-in</h1>
				<p class="jafar-login__desc">
					This area is isolated from contractor accounts. All attempts are logged and rate-limited.
				</p>
			</div>

			<div class="jafar-login__body">
				{#if errorMessage}
					<AuthAlert message={errorMessage} variant="destructive" />
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

					<div class="jafar-login__totp">
						<label for="totp" class="jafar-login__totp-label">Authenticator code</label>
						<input
							id="totp"
							name="totp"
							inputmode="numeric"
							autocomplete="one-time-code"
							placeholder="123 456"
							maxlength="6"
							class="jafar-login__totp-input"
						/>
						<p class="jafar-login__totp-hint">6-digit code from your authenticator app (TOTP).</p>
					</div>

					<button type="submit" disabled={loading} class="jafar-btn jafar-btn--red-lg">
						{#if loading}
							<i class="ri-loader-4-line j-spin" aria-hidden="true"></i>
							Verifying…
						{:else}
							Continue
						{/if}
					</button>
				</form>
			</div>

			<div class="jafar-login__footer">
				Not a platform owner?
				<a href="/auth/login">Contractor sign-in →</a>
			</div>
		</div>

		<p class="jafar-login__copyright">
			© {new Date().getFullYear()} Contractor OS · Internal use only
		</p>
	</div>
</main>

<style>
	.login-form {
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
	}
</style>
