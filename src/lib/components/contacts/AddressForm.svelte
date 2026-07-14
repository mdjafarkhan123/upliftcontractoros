<script lang="ts">
	type AddressDraft = {
		label: 'billing' | 'service' | 'mailing' | 'other';
		address_line_1: string;
		address_line_2: string;
		city: string;
		state: string;
		zip: string;
		is_primary: boolean;
	};

	let props: { value: AddressDraft; disabled?: boolean; required?: boolean } = $props();
	let value = $derived(props.value);
	let disabled = $derived(props.disabled ?? false);
	// When the address is optional (e.g. the create-contact form), the caller can
	// turn off native `required` and validate conditionally instead.
	let required = $derived(props.required ?? true);
</script>

<div class="address-form">
	<!-- Label type -->
	<div class="field address-form__span-2">
		<label class="field__label" for="addr_label">Label</label>
		<select id="addr_label" class="field__select" bind:value={value.label} {disabled}>
			<option value="service">Service</option>
			<option value="billing">Billing</option>
			<option value="mailing">Mailing</option>
			<option value="other">Other</option>
		</select>
	</div>

	<!-- Address line 1 -->
	<div class="field address-form__span-2">
		<label class="field__label" class:field__label--required={required} for="addr1"
			>Address line 1</label
		>
		<input
			id="addr1"
			class="field__input"
			bind:value={value.address_line_1}
			{disabled}
			{required}
		/>
	</div>

	<!-- Address line 2 -->
	<div class="field address-form__span-2">
		<label class="field__label" for="addr2">Address line 2</label>
		<input id="addr2" class="field__input" bind:value={value.address_line_2} {disabled} />
	</div>

	<!-- City -->
	<div class="field">
		<label class="field__label" class:field__label--required={required} for="city">City</label>
		<input id="city" class="field__input" bind:value={value.city} {disabled} {required} />
	</div>

	<!-- State + ZIP -->
	<div class="address-form__state-zip">
		<div class="field">
			<label class="field__label" class:field__label--required={required} for="addr_state"
				>State</label
			>
			<input
				id="addr_state"
				class="field__input"
				bind:value={value.state}
				{disabled}
				{required}
				maxlength={40}
			/>
		</div>
		<div class="field">
			<label class="field__label" class:field__label--required={required} for="zip">ZIP</label>
			<input id="zip" class="field__input" bind:value={value.zip} {disabled} {required} />
		</div>
	</div>

	<!-- Primary checkbox -->
	<label class="address-form__primary-check address-form__span-2">
		<input type="checkbox" bind:checked={value.is_primary} {disabled} />
		<span>Make this the primary address</span>
	</label>
</div>
