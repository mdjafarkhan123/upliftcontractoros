<script lang="ts">
	import { Dialog } from 'bits-ui';
	import EmptyState from '$lib/components/shared/EmptyState.svelte';
	import ConfirmDialog from '$lib/components/shared/ConfirmDialog.svelte';
	import { Button } from '$lib/components/ui/button';
	import Badge from '$lib/components/shared/Badge.svelte';
	import AddressForm from './AddressForm.svelte';

	type Address = {
		id: string;
		label: 'billing' | 'service' | 'mailing' | 'other';
		address_line_1: string;
		address_line_2: string | null;
		city: string;
		state: string;
		zip: string;
		is_primary: boolean;
		updated_at: string;
	};

	let {
		contactId,
		addresses = $bindable<Address[]>([]),
		canEdit
	}: {
		contactId: string;
		addresses?: Address[];
		canEdit: boolean;
	} = $props();

	let editorOpen = $state(false);
	let editing = $state<Address | null>(null);
	type AddressDraft = {
		label: 'billing' | 'service' | 'mailing' | 'other';
		address_line_1: string;
		address_line_2: string;
		city: string;
		state: string;
		zip: string;
		is_primary: boolean;
	};

	let draft = $state<AddressDraft>({
		label: 'service',
		address_line_1: '',
		address_line_2: '',
		city: '',
		state: '',
		zip: '',
		is_primary: false
	});
	let saving = $state(false);
	let errorMsg = $state<string | null>(null);

	let confirmOpen = $state(false);
	let pendingDeleteId = $state<string | null>(null);
	let deleting = $state(false);

	function openCreate() {
		editing = null;
		draft = {
			label: 'service',
			address_line_1: '',
			address_line_2: '',
			city: '',
			state: '',
			zip: '',
			is_primary: addresses.length === 0
		};
		errorMsg = null;
		editorOpen = true;
	}

	function openEdit(a: Address) {
		editing = a;
		draft = {
			label: a.label,
			address_line_1: a.address_line_1,
			address_line_2: a.address_line_2 ?? '',
			city: a.city,
			state: a.state,
			zip: a.zip,
			is_primary: a.is_primary
		};
		errorMsg = null;
		editorOpen = true;
	}

	async function save() {
		saving = true;
		errorMsg = null;
		const payload = {
			label: draft.label,
			address_line_1: draft.address_line_1,
			address_line_2: draft.address_line_2 || undefined,
			city: draft.city,
			state: draft.state,
			zip: draft.zip,
			is_primary: draft.is_primary,
			...(editing ? { updated_at: editing.updated_at } : {})
		};
		try {
			const res = editing
				? await fetch(`/api/contacts/${contactId}/addresses/${editing.id}`, {
						method: 'PATCH',
						headers: { 'content-type': 'application/json' },
						body: JSON.stringify(payload)
					})
				: await fetch(`/api/contacts/${contactId}/addresses`, {
						method: 'POST',
						headers: { 'content-type': 'application/json' },
						body: JSON.stringify(payload)
					});

			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				errorMsg = body.error ?? 'Failed to save address.';
				return;
			}
			const body = (await res.json()) as { address: Address };
			if (editing) {
				addresses = addresses.map((a) => {
					if (a.id === body.address.id) return body.address;
					if (body.address.is_primary && a.is_primary) return { ...a, is_primary: false };
					return a;
				});
			} else {
				if (body.address.is_primary) {
					addresses = addresses.map((a) => ({ ...a, is_primary: false }));
				}
				addresses = [...addresses, body.address];
			}
			editorOpen = false;
		} finally {
			saving = false;
		}
	}

	async function setPrimary(id: string) {
		const res = await fetch(`/api/contacts/${contactId}/addresses/${id}/set-primary`, {
			method: 'PATCH'
		});
		if (res.ok) {
			addresses = addresses.map((a) => ({ ...a, is_primary: a.id === id }));
		}
	}

	function askDelete(id: string) {
		pendingDeleteId = id;
		confirmOpen = true;
	}

	async function confirmDelete() {
		if (!pendingDeleteId) return;
		deleting = true;
		try {
			const res = await fetch(`/api/contacts/${contactId}/addresses/${pendingDeleteId}`, {
				method: 'DELETE'
			});
			if (res.ok) {
				addresses = addresses.filter((a) => a.id !== pendingDeleteId);
			}
		} finally {
			deleting = false;
			pendingDeleteId = null;
		}
	}
</script>

<div style="display:flex; flex-direction:column; gap:1rem;">
	{#if canEdit}
		<Button onclick={openCreate}>
			<i class="ri-add-line" aria-hidden="true"></i> Add address
		</Button>
	{/if}

	{#if addresses.length === 0}
		<EmptyState
			title="No addresses on file"
			description={canEdit
				? 'Add an address to use for jobs and invoices.'
				: 'Addresses for this contact will appear here.'}
			iconClass="ri-map-pin-line"
		/>
	{:else}
		<ul style="list-style:none; padding:0; display:flex; flex-direction:column; gap:0.75rem;">
			{#each addresses as a (a.id)}
				<li class="contact-address-item">
					<div class="contact-address-item__inner">
						<div class="contact-address-item__body">
							<div class="contact-address-item__badge-row">
								<Badge
									variant={a.is_primary ? 'success' : 'default'}
									label={a.label[0].toUpperCase() + a.label.slice(1)}
								/>
								{#if a.is_primary}
									<span class="contact-address-item__primary-flag">
										<i class="ri-star-fill" aria-hidden="true"></i> Primary
									</span>
								{/if}
							</div>
							<p class="contact-address-item__line">{a.address_line_1}</p>
							{#if a.address_line_2}
								<p class="contact-address-item__line">{a.address_line_2}</p>
							{/if}
							<p class="contact-address-item__line contact-address-item__line--city">
								{a.city}, {a.state} {a.zip}
							</p>
						</div>
						{#if canEdit}
							<div class="contact-address-item__actions">
								<button
									type="button"
									class="contact-address-item__icon-btn"
									aria-label="Edit address"
									onclick={() => openEdit(a)}
								>
									<i class="ri-edit-line" aria-hidden="true"></i>
								</button>
								{#if !a.is_primary}
									<button
										type="button"
										class="contact-address-item__icon-btn"
										aria-label="Set as primary"
										onclick={() => setPrimary(a.id)}
									>
										<i class="ri-star-line" aria-hidden="true"></i>
									</button>
								{/if}
								<button
									type="button"
									class="contact-address-item__icon-btn contact-address-item__icon-btn--danger"
									aria-label="Delete address"
									onclick={() => askDelete(a.id)}
								>
									<i class="ri-delete-bin-line" aria-hidden="true"></i>
								</button>
							</div>
						{/if}
					</div>
				</li>
			{/each}
		</ul>
	{/if}
</div>

<!-- Address editor dialog -->
<Dialog.Root bind:open={editorOpen}>
	<Dialog.Portal>
		<Dialog.Overlay class="dialog-overlay" />
		<Dialog.Content class="dialog-content dialog-content--wide">
			<div class="dialog-content__header">
				<div>
					<h2 class="dialog-content__title">{editing ? 'Edit address' : 'Add address'}</h2>
				</div>
				<Dialog.Close class="dialog-content__close">
					<i class="ri-close-line address-tab__close-icon" aria-hidden="true"></i>
				</Dialog.Close>
			</div>
			<div class="dialog-content__body">
				<AddressForm value={draft} disabled={saving} />
				{#if errorMsg}
					<p class="field__error">{errorMsg}</p>
				{/if}
			</div>
			<div class="dialog-content__footer">
				<Button
					variant="secondary"
					disabled={saving}
					onclick={() => (editorOpen = false)}
				>
					Cancel
				</Button>
				<Button
					loadingLabel="Saving…"
					successLabel="Saved"
					loading={saving}
					onclick={save}
				>
					Save address
				</Button>
			</div>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>

<ConfirmDialog
	bind:open={confirmOpen}
	title="Delete address?"
	description="The address will be removed from this contact."
	confirmLabel="Delete"
	variant="destructive"
	loading={deleting}
	onConfirm={confirmDelete}
/>

<style lang="scss">
	@use '$lib/styles/tokens' as *;

	.address-tab__close-icon {
		font-size: $fs-body;
	}
</style>
