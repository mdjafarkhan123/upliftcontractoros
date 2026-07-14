<script lang="ts">
	import { Popover } from 'bits-ui';
	import { AsYouType, parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js';
	import { PHONE_COUNTRIES, phoneCountry } from '$lib/utils/phoneCountries';

	let {
		value = $bindable<string>(''),
		defaultCountry = 'US',
		id,
		required = false,
		invalid = false,
		disabled = false,
		placeholder = ''
	}: {
		value: string;
		defaultCountry?: string;
		id?: string;
		required?: boolean;
		invalid?: boolean;
		disabled?: boolean;
		placeholder?: string;
	} = $props();

	let country = $state<string>(defaultCountry.toUpperCase());
	let national = $state('');
	let touched = $state(false);
	let lastEmitted = $state('');
	let open = $state(false);
	let query = $state('');

	const selectedCountry = $derived(phoneCountry(country) ?? phoneCountry('US')!);

	const filtered = $derived.by(() => {
		const q = query.trim().toLowerCase();
		if (!q) return PHONE_COUNTRIES;
		return PHONE_COUNTRIES.filter(
			(c) => c.name.toLowerCase().includes(q) || c.dial.includes(q)
		);
	});

	const parsed = $derived.by(() => {
		if (!national.trim()) return null;
		return parsePhoneNumberFromString(national, country as CountryCode) ?? null;
	});

	const isValid = $derived(parsed?.isValid() ?? false);
	const localInvalid = $derived(touched && national.trim() !== '' && !isValid);
	const showInvalid = $derived(invalid || localInvalid);
	// Only show our own format message when the parent isn't already showing a
	// server-driven error for this field (e.g. "phone already in use").
	const showLocalMessage = $derived(localInvalid && !invalid);

	// Seed from an incoming E.164 value (edit forms) without fighting the
	// user's own typing — only re-seed when the prop changes to something we
	// didn't just emit ourselves.
	$effect(() => {
		if (value === lastEmitted) return;
		if (!value) {
			national = '';
			return;
		}
		const seed = parsePhoneNumberFromString(value);
		if (seed) {
			country = seed.country ?? country;
			national = seed.formatNational();
		} else {
			national = value;
		}
	});

	function emit() {
		if (!national.trim()) {
			lastEmitted = '';
			value = '';
			return;
		}
		if (isValid && parsed) {
			lastEmitted = parsed.format('E.164');
			value = lastEmitted;
		} else {
			lastEmitted = national;
			value = national;
		}
	}

	function onInput(raw: string) {
		national = new AsYouType(country as CountryCode).input(raw);
		emit();
	}

	function selectCountry(code: string) {
		country = code;
		open = false;
		query = '';
		// Reformat the digits already typed against the new country.
		const digits = national.replace(/\D+/g, '');
		national = digits ? new AsYouType(country as CountryCode).input(digits) : '';
		emit();
	}

	function onBlur() {
		touched = true;
	}
</script>

<div class="phone-field" class:phone-field--invalid={showInvalid} class:phone-field--disabled={disabled}>
	<Popover.Root bind:open>
		<Popover.Trigger {disabled} type="button" class="phone-field__country">
			<span class="phone-field__flag">{selectedCountry.flag}</span>
			<span class="phone-field__dial">{selectedCountry.dial}</span>
			<i class="phone-field__caret ri-arrow-down-s-line" aria-hidden="true"></i>
		</Popover.Trigger>

		<Popover.Portal>
			<Popover.Content sideOffset={6} align="start" class="phone-field__panel">
				<div class="phone-field__search">
					<i class="phone-field__search-icon ri-search-line" aria-hidden="true"></i>
					<!-- svelte-ignore a11y_autofocus -->
					<input
						autofocus
						bind:value={query}
						type="text"
						inputmode="search"
						placeholder="Search country or code…"
						class="phone-field__search-input"
					/>
				</div>
				<div class="phone-field__list">
					{#if filtered.length === 0}
						<div class="phone-field__empty">No countries match "{query}"</div>
					{:else}
						{#each filtered as c (c.code)}
							<button
								type="button"
								class="phone-field__opt"
								class:phone-field__opt--selected={c.code === country}
								onclick={() => selectCountry(c.code)}
							>
								<span class="phone-field__opt-flag">{c.flag}</span>
								<span class="phone-field__opt-name">{c.name}</span>
								<span class="phone-field__opt-dial">{c.dial}</span>
							</button>
						{/each}
					{/if}
				</div>
			</Popover.Content>
		</Popover.Portal>
	</Popover.Root>

	<input
		{id}
		type="tel"
		inputmode="tel"
		class="phone-field__input"
		{required}
		{disabled}
		{placeholder}
		autocomplete="tel"
		value={national}
		aria-invalid={showInvalid ? 'true' : undefined}
		oninput={(e) => onInput(e.currentTarget.value)}
		onblur={onBlur}
	/>
</div>

{#if showLocalMessage}
	<p class="field__error">Enter a valid phone number for {selectedCountry.name}</p>
{/if}
