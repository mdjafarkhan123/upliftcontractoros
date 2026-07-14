<script lang="ts">
	import { enhance } from '$app/forms';
	import AuthCard from '$lib/components/auth/AuthCard.svelte';
	import AuthAlert from '$lib/components/auth/AuthAlert.svelte';
	import AuthField from '$lib/components/auth/AuthField.svelte';

	let {
		form
	}: {
		form?: { error?: string };
	} = $props();

	let loading = $state(false);
</script>

<svelte:head>
	<title>Set New Password — Contractor OS</title>
</svelte:head>

<AuthCard
	title="Set your password"
	description="Choose a strong password to secure your account before continuing."
>
	{#snippet children()}
		{#if form?.error}
			<div class="change-pw__alert">
				<AuthAlert message={form.error} variant="destructive" />
			</div>
		{/if}

		<div class="change-pw__note">
			<i class="ri-information-line change-pw__note-icon" aria-hidden="true"></i>
			<p>Your password must be at least 8 characters long.</p>
		</div>

		<form
			method="POST"
			class="change-pw__form"
			use:enhance={() => {
				loading = true;
				return async ({ update }) => {
					await update();
					loading = false;
				};
			}}
		>
			<AuthField
				id="password"
				label="New password"
				type="password"
				autocomplete="new-password"
				minlength={8}
				placeholder="At least 8 characters"
				required
			/>

			<AuthField
				id="confirm_password"
				label="Confirm password"
				type="password"
				autocomplete="new-password"
				minlength={8}
				placeholder="Repeat your password"
				required
			/>

			<button type="submit" disabled={loading} class="btn btn--primary change-pw__submit">
				{#if loading}
					<i class="ri-loader-4-line animate-spin" aria-hidden="true"></i>
					Updating…
				{:else}
					Set password & continue
				{/if}
			</button>
		</form>
	{/snippet}
</AuthCard>

<style lang="scss">
	@use '$lib/styles/tokens' as *;

	.change-pw__alert {
		margin-bottom: $space-5;
	}

	.change-pw__note {
		display: flex;
		align-items: flex-start;
		gap: $space-3;
		margin-bottom: $space-5;
		border-radius: $radius-lg;
		border: 1px solid rgba(53, 56, 205, 0.2);
		background: var(--info-bg);
		padding: $space-3 $space-4;
		font-size: $fs-body;
		line-height: $lh-body;
		color: var(--info-text);
	}

	.change-pw__note-icon {
		flex-shrink: 0;
		margin-top: 1px;
		font-size: 16px;
		line-height: 1;
	}

	.change-pw__form {
		display: flex;
		flex-direction: column;
		gap: $space-5;
	}

	.change-pw__submit {
		width: 100%;
		height: 44px;
		margin-top: $space-1;
	}
</style>
