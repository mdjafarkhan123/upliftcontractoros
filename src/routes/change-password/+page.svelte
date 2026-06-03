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
			<div class="mb-5">
				<AuthAlert message={form.error} variant="destructive" />
			</div>
		{/if}

		<div
			class="mb-5 flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3.5"
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="16"
				height="16"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
				class="mt-0.5 shrink-0 text-blue-600"
				aria-hidden="true"
			>
				<circle cx="12" cy="12" r="10" />
				<line x1="12" y1="16" x2="12" y2="12" />
				<line x1="12" y1="8" x2="12.01" y2="8" />
			</svg>
			<p class="text-sm text-blue-700 leading-relaxed">
				Your password must be at least 8 characters long.
			</p>
		</div>

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

			<button
				type="submit"
				disabled={loading}
				class="w-full h-11 rounded-xl bg-primary text-sm font-semibold text-white shadow-md shadow-primary/20 hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed transition-all duration-150 cursor-pointer"
			>
				{#if loading}
					<span class="inline-flex items-center justify-center gap-2">
						<svg
							class="animate-spin h-4 w-4"
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
						Updating…
					</span>
				{:else}
					Set password & continue
				{/if}
			</button>
		</form>
	{/snippet}
</AuthCard>
