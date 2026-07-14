<script lang="ts">
	import PhoneField from '$lib/components/shared/PhoneField.svelte';

	type Props = {
		submitting: boolean;
		error: string | null;
		fieldErrors: Record<string, string>;
		defaultCountry?: string;
		onSubmit: (input: {
			customerName: string;
			customerPhone: string;
			customerEmail: string;
			notes: string;
			website: string; // honeypot
		}) => void;
	};

	let { submitting, error, fieldErrors, defaultCountry = 'US', onSubmit }: Props = $props();

	let customerName = $state('');
	let customerPhone = $state('');
	let customerEmail = $state('');
	let notes = $state('');
	let website = $state(''); // honeypot — must stay empty

	function handleSubmit(e: SubmitEvent) {
		e.preventDefault();
		if (submitting) return;
		onSubmit({
			customerName: customerName.trim(),
			customerPhone: customerPhone.trim(),
			customerEmail: customerEmail.trim(),
			notes: notes.trim(),
			website
		});
	}
</script>

<form onsubmit={handleSubmit} class="bk-form" novalidate>
	<!-- Honeypot — visually hidden, never label it, never reference it on screen -->
	<div aria-hidden="true" class="bk-form__honeypot">
		<label>
			Website
			<input type="text" tabindex="-1" autocomplete="off" name="website" bind:value={website} />
		</label>
	</div>

	<div class="bk-form__field">
		<label for="bk-name" class="bk-form__label">
			Full name <span class="bk-form__req">*</span>
		</label>
		<input
			id="bk-name"
			type="text"
			required
			autocomplete="name"
			placeholder="Jane Doe"
			bind:value={customerName}
			disabled={submitting}
			class="bk-form__input {fieldErrors.customerName ? 'bk-form__input--error' : ''}"
		/>
		{#if fieldErrors.customerName}
			<p class="bk-form__field-error">{fieldErrors.customerName}</p>
		{/if}
	</div>

	<div class="bk-form__field">
		<label for="bk-phone" class="bk-form__label">
			Phone number <span class="bk-form__req">*</span>
		</label>
		<PhoneField
			id="bk-phone"
			required
			bind:value={customerPhone}
			{defaultCountry}
			invalid={!!fieldErrors.customerPhone}
			disabled={submitting}
		/>
		{#if fieldErrors.customerPhone}
			<p class="bk-form__field-error">{fieldErrors.customerPhone}</p>
		{/if}
	</div>

	<div class="bk-form__field">
		<label for="bk-email" class="bk-form__label">
			Email <span class="bk-form__opt">(optional)</span>
		</label>
		<input
			id="bk-email"
			type="email"
			autocomplete="email"
			placeholder="you@example.com"
			bind:value={customerEmail}
			disabled={submitting}
			class="bk-form__input {fieldErrors.customerEmail ? 'bk-form__input--error' : ''}"
		/>
		{#if fieldErrors.customerEmail}
			<p class="bk-form__field-error">{fieldErrors.customerEmail}</p>
		{/if}
	</div>

	<div class="bk-form__field">
		<label for="bk-notes" class="bk-form__label">
			Anything we should know? <span class="bk-form__opt">(optional)</span>
		</label>
		<textarea
			id="bk-notes"
			rows="3"
			placeholder="Brief description of what you need…"
			bind:value={notes}
			disabled={submitting}
			class="bk-form__textarea"
		></textarea>
	</div>

	{#if error}
		<div class="bk-form__error">{error}</div>
	{/if}

	<button type="submit" disabled={submitting} class="bk-form__submit">
		{#if submitting}
			<i class="ri-loader-4-line animate-spin" aria-hidden="true"></i>
			<span>Booking…</span>
		{:else}
			<span>Book Appointment</span>
		{/if}
	</button>
</form>
