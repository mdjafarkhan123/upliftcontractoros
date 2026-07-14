<script lang="ts">
	import { enhance } from '$app/forms';
	import AuthCard from '$lib/components/auth/AuthCard.svelte';
	import AuthAlert from '$lib/components/auth/AuthAlert.svelte';
	import AuthField from '$lib/components/auth/AuthField.svelte';

	let {
		form
	}: {
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
			<div class="forgot-alert">
				<AuthAlert message={form.error} variant="destructive" />
			</div>
		{/if}

		{#if sent}
			<div class="forgot-success">
				<div class="forgot-success__icon">
					<i class="ri-mail-check-line" aria-hidden="true"></i>
				</div>
				<h2 class="forgot-success__heading">Check your email</h2>
				<p class="forgot-success__body">
					We've sent a reset link to <strong class="forgot-success__email"
						>{emailValue || 'your email'}</strong
					>. Check your inbox and follow the instructions.
				</p>
			</div>
		{:else}
			<form
				method="POST"
				class="forgot-form"
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

				<button type="submit" disabled={loading} class="btn btn--primary forgot-form__submit">
					{#if loading}
						<i class="ri-loader-4-line animate-spin" aria-hidden="true"></i>
						Sending…
					{:else}
						Send reset link
					{/if}
				</button>
			</form>
		{/if}
	{/snippet}

	{#snippet footer()}
		<a href="/auth/login" class="forgot-back">
			<i class="ri-arrow-left-line" aria-hidden="true"></i>
			Back to sign in
		</a>
	{/snippet}
</AuthCard>

<style lang="scss">
	@use '$lib/styles/tokens' as *;

	.forgot-alert {
		margin-bottom: $space-5;
	}

	.forgot-form {
		display: flex;
		flex-direction: column;
		gap: $space-5;
	}

	.forgot-form__submit {
		width: 100%;
		height: 44px;
		margin-top: $space-1;
	}

	// ── Success state ─────────────────────────────────────────────────────────

	.forgot-success {
		text-align: center;
		padding: $space-4 0;
	}

	.forgot-success__icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 56px;
		height: 56px;
		border-radius: $radius-full;
		background: rgba(34, 125, 83, 0.12);
		box-shadow: 0 0 0 1px rgba(34, 125, 83, 0.25);
		color: var(--color-brand);
		margin: 0 auto $space-4;
		font-size: 24px;
		line-height: 1;
	}

	.forgot-success__heading {
		font-size: $fs-lg;
		font-weight: $weight-semibold;
		color: var(--color-text-primary);
	}

	.forgot-success__body {
		margin-top: $space-2;
		font-size: $fs-body;
		line-height: $lh-body;
		color: var(--color-text-secondary);
	}

	.forgot-success__email {
		font-weight: $weight-medium;
		color: var(--color-text-primary);
	}

	// ── Footer back link ──────────────────────────────────────────────────────

	.forgot-back {
		display: inline-flex;
		align-items: center;
		gap: $space-2;
		font-size: $fs-body;
		font-weight: $weight-medium;
		color: var(--color-text-secondary);
		text-decoration: none;
		min-height: 44px;
		transition: color $duration-fast $ease-standard;

		&:hover {
			color: var(--color-text-primary);
		}

		i {
			font-size: 16px;
			line-height: 1;
		}
	}
</style>
