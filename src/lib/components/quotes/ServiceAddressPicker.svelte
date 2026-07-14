<script lang="ts">
	import * as Select from '$lib/components/ui/select';
	import * as Sheet from '$lib/components/ui/sheet';
	import { Button } from '$lib/components/ui/button';
	import AddressForm from '$lib/components/contacts/AddressForm.svelte';
	import { toast } from '$lib/stores/toast.svelte';

	type AddressItem = {
		id: string;
		label: 'billing' | 'service' | 'mailing' | 'other';
		address_line_1: string;
		address_line_2: string | null;
		city: string;
		state: string;
		zip: string;
		is_primary: boolean;
	};

	let {
		contactId,
		selectedAddressId = $bindable<string | null>(null),
		disabled = false,
		autoSelectPrimary = false
	}: {
		contactId: string | null;
		selectedAddressId?: string | null;
		disabled?: boolean;
		autoSelectPrimary?: boolean;
	} = $props();

	let addresses = $state<AddressItem[]>([]);
	let loading = $state(false);
	let loadedForContact = $state<string | null>(null);

	// Sheet (add new address)
	let sheetOpen = $state(false);
	let saving = $state(false);
	let formError = $state<string | null>(null);
	let draft = $state({
		label: 'service' as 'billing' | 'service' | 'mailing' | 'other',
		address_line_1: '',
		address_line_2: '',
		city: '',
		state: '',
		zip: '',
		is_primary: false
	});

	function resetDraft() {
		draft = {
			label: 'service',
			address_line_1: '',
			address_line_2: '',
			city: '',
			state: '',
			zip: '',
			is_primary: false
		};
		formError = null;
	}

	async function loadAddresses(id: string) {
		loading = true;
		try {
			const res = await fetch(`/api/contacts/${id}/addresses`);
			if (!res.ok) {
				addresses = [];
				return;
			}
			const body = await res.json();
			addresses = (body.data ?? []) as AddressItem[];
			if (autoSelectPrimary && !selectedAddressId) {
				const primary = addresses.find((a) => a.is_primary) ?? addresses[0];
				if (primary) selectedAddressId = primary.id;
			}
		} finally {
			loading = false;
		}
	}

	// Reload whenever the contact changes. On the start screen (autoSelectPrimary) a
	// contact switch resets the chosen address so the new contact's primary is picked.
	$effect(() => {
		const id = contactId;
		if (!id) {
			addresses = [];
			loadedForContact = null;
			return;
		}
		if (loadedForContact === id) return;
		if (autoSelectPrimary && loadedForContact !== null) selectedAddressId = null;
		loadedForContact = id;
		void loadAddresses(id);
	});

	// Select binds to a string ('' = none). Map to/from null.
	const selectValue = $derived(selectedAddressId ?? '');
	function onSelect(v: string) {
		selectedAddressId = v === '' ? null : v;
	}

	function fmt(a: AddressItem): string {
		return [a.address_line_1, a.city, a.state].filter(Boolean).join(', ');
	}
	function labelText(l: string): string {
		return l.charAt(0).toUpperCase() + l.slice(1);
	}

	async function saveNewAddress() {
		if (!contactId) return;
		if (
			!draft.address_line_1.trim() ||
			!draft.city.trim() ||
			!draft.state.trim() ||
			!draft.zip.trim()
		) {
			formError = 'Address line 1, city, state, and ZIP are required.';
			return;
		}
		saving = true;
		formError = null;
		try {
			const res = await fetch(`/api/contacts/${contactId}/addresses`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					label: draft.label,
					address_line_1: draft.address_line_1.trim(),
					address_line_2: draft.address_line_2.trim() || undefined,
					city: draft.city.trim(),
					state: draft.state.trim(),
					zip: draft.zip.trim(),
					is_primary: draft.is_primary
				})
			});
			const body = await res.json().catch(() => ({}));
			if (!res.ok) {
				formError = body.error ?? 'Could not save the address.';
				return;
			}
			const created = body.address;
			await loadAddresses(contactId);
			if (created?.id) selectedAddressId = created.id;
			sheetOpen = false;
			resetDraft();
			toast.success('Address added');
		} catch {
			formError = 'Network error. Please try again.';
		} finally {
			saving = false;
		}
	}
</script>

<div class="service-address">
	<div class="service-address__row">
		<Select.Root value={selectValue} onValueChange={onSelect} {disabled}>
			<Select.Trigger class="service-address__select">
				{#if loading}
					<span class="service-address__placeholder">Loading addresses…</span>
				{:else if selectedAddressId}
					{@const a = addresses.find((x) => x.id === selectedAddressId)}
					<span class="service-address__value">
						<i class="ri-map-pin-line" aria-hidden="true"></i>
						<span>{a ? fmt(a) : 'Selected address'}</span>
					</span>
				{:else}
					<span class="service-address__placeholder">No service address</span>
				{/if}
			</Select.Trigger>
			<Select.Content>
				<Select.Item value="">No service address</Select.Item>
				{#each addresses as a (a.id)}
					<Select.Item value={a.id}>
						<span class="service-address__opt">
							<span class="service-address__opt-main">{fmt(a)}</span>
							<span class="service-address__opt-sub">
								{labelText(a.label)}{a.is_primary ? ' · Primary' : ''} · {a.zip}
							</span>
						</span>
					</Select.Item>
				{/each}
			</Select.Content>
		</Select.Root>
		<Button
			variant="secondary"
			size="lg"
			class="service-address__add"
			disabled={disabled || !contactId}
			onclick={() => {
				resetDraft();
				sheetOpen = true;
			}}
		>
			<i class="ri-add-line" aria-hidden="true"></i>
			<span>Add</span>
		</Button>
	</div>
	{#if contactId && !loading && addresses.length === 0}
		<p class="service-address__warn">
			<i class="ri-alert-line" aria-hidden="true"></i>No address on file —
			<button
				type="button"
				disabled={disabled || !contactId}
				onclick={() => {
					resetDraft();
					sheetOpen = true;
				}}>add one for the job site</button
			>
		</p>
	{/if}
</div>

<Sheet.Root bind:open={sheetOpen}>
	<Sheet.Content side="right" class="w-full overflow-y-auto sm:max-w-md">
		<Sheet.Header>
			<Sheet.Title>Add service address</Sheet.Title>
		</Sheet.Header>
		<div class="service-address__sheet-body">
			<AddressForm value={draft} disabled={saving} />
			{#if formError}
				<p class="service-address__sheet-error">{formError}</p>
			{/if}
			<div class="service-address__sheet-actions">
				<Button
					variant="secondary"
					onclick={() => (sheetOpen = false)}
					disabled={saving}
				>
					Cancel
				</Button>
				<Button
					loadingLabel="Saving…"
					successLabel="Saved"
					loading={saving}
					onclick={saveNewAddress}
				>
					Save address
				</Button>
			</div>
		</div>
	</Sheet.Content>
</Sheet.Root>
