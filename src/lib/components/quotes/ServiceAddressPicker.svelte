<script lang="ts">
	import * as Select from '$lib/components/ui/select';
	import * as Sheet from '$lib/components/ui/sheet';
	import { Button } from '$lib/components/ui/button';
	import JetEngineButton from '$lib/components/shared/JetEngineButton.svelte';
	import AddressForm from '$lib/components/contacts/AddressForm.svelte';
	import { toast } from '$lib/stores/toast.svelte';
	import { AlertTriangle, MapPin, Plus } from '@lucide/svelte';

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

<div class="space-y-2">
	<div class="flex items-stretch gap-2">
		<Select.Root value={selectValue} onValueChange={onSelect} {disabled}>
			<Select.Trigger class="h-11 w-full">
				{#if loading}
					<span class="text-muted-foreground">Loading addresses…</span>
				{:else if selectedAddressId}
					{@const a = addresses.find((x) => x.id === selectedAddressId)}
					<span class="flex min-w-0 items-center gap-2">
						<MapPin class="h-4 w-4 shrink-0 text-muted-foreground" />
						<span class="truncate">{a ? fmt(a) : 'Selected address'}</span>
					</span>
				{:else}
					<span class="text-muted-foreground">No service address</span>
				{/if}
			</Select.Trigger>
			<Select.Content>
				<Select.Item value="">No service address</Select.Item>
				{#each addresses as a (a.id)}
					<Select.Item value={a.id}>
						<span class="flex flex-col">
							<span class="text-sm">{fmt(a)}</span>
							<span class="text-xs text-muted-foreground">
								{labelText(a.label)}{a.is_primary ? ' · Primary' : ''} · {a.zip}
							</span>
						</span>
					</Select.Item>
				{/each}
			</Select.Content>
		</Select.Root>
		<Button
			type="button"
			variant="outline"
			class="h-11 shrink-0"
			disabled={disabled || !contactId}
			onclick={() => {
				resetDraft();
				sheetOpen = true;
			}}
		>
			<Plus class="h-4 w-4" />
			<span class="ml-1 hidden sm:inline">Add</span>
		</Button>
	</div>
	{#if contactId && !loading && addresses.length === 0}
		<p
			class="inline-flex w-fit items-center gap-1 rounded-md bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-300"
		>
			<AlertTriangle class="h-3 w-3 shrink-0" />No address on file —
			<button
				type="button"
				class="underline underline-offset-2 hover:no-underline disabled:no-underline disabled:opacity-60"
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
		<div class="mt-4 space-y-4">
			<AddressForm value={draft} disabled={saving} />
			{#if formError}
				<p class="text-xs text-destructive">{formError}</p>
			{/if}
			<div class="grid grid-cols-2 gap-2">
				<Button variant="outline" onclick={() => (sheetOpen = false)} disabled={saving}>
					Cancel
				</Button>
				<JetEngineButton
					label="Save address"
					loadingLabel="Saving…"
					successLabel="Saved"
					state={saving ? 'loading' : 'idle'}
					onclick={saveNewAddress}
				/>
			</div>
		</div>
	</Sheet.Content>
</Sheet.Root>
