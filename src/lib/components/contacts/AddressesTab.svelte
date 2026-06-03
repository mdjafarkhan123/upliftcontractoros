<script lang="ts">
	import EmptyState from '$lib/components/shared/EmptyState.svelte';
	import BottomSheet from '$lib/components/shared/BottomSheet.svelte';
	import ConfirmDialog from '$lib/components/shared/ConfirmDialog.svelte';
	import { Button } from '$lib/components/ui/button';
	import JetEngineButton from '$lib/components/shared/JetEngineButton.svelte';
	import Badge from '$lib/components/shared/Badge.svelte';
	import AddressForm from './AddressForm.svelte';
	import { Plus, MapPin, Star, Pencil, Trash2 } from '@lucide/svelte';

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
			// Optimistic concurrency token (edits only) so a concurrent change by
			// another team member is surfaced instead of silently overwritten.
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

<div class="flex flex-col gap-4">
	{#if canEdit}
		<Button onclick={openCreate} class="w-full md:w-auto">
			<Plus class="h-4 w-4" /> Add address
		</Button>
	{/if}

	{#if addresses.length === 0}
		<EmptyState
			title="No addresses on file"
			description={canEdit
				? 'Add an address to use for jobs and invoices.'
				: 'Addresses for this contact will appear here.'}
			icon={MapPin}
		/>
	{:else}
		<ul class="space-y-3">
			{#each addresses as a (a.id)}
				<li class="rounded-xl border border-border bg-card p-4">
					<div class="flex items-start justify-between gap-3">
						<div class="min-w-0 flex-1">
							<div class="flex items-center gap-2">
								<Badge
									variant={a.is_primary ? 'success' : 'default'}
									label={a.label[0].toUpperCase() + a.label.slice(1)}
								/>
								{#if a.is_primary}<span
										class="inline-flex items-center gap-1 text-xs font-medium text-green-700"
										><Star class="h-3 w-3" /> Primary</span
									>{/if}
							</div>
							<p class="mt-2 text-sm text-foreground">{a.address_line_1}</p>
							{#if a.address_line_2}<p class="text-sm text-foreground">{a.address_line_2}</p>{/if}
							<p class="text-sm text-muted-foreground">{a.city}, {a.state} {a.zip}</p>
						</div>
						{#if canEdit}
							<div class="flex shrink-0 flex-col items-end gap-1">
								<button
									type="button"
									class="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
									aria-label="Edit address"
									onclick={() => openEdit(a)}
								>
									<Pencil class="h-4 w-4" />
								</button>
								{#if !a.is_primary}
									<button
										type="button"
										class="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
										aria-label="Set as primary"
										onclick={() => setPrimary(a.id)}
									>
										<Star class="h-4 w-4" />
									</button>
								{/if}
								<button
									type="button"
									class="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
									aria-label="Delete address"
									onclick={() => askDelete(a.id)}
								>
									<Trash2 class="h-4 w-4" />
								</button>
							</div>
						{/if}
					</div>
				</li>
			{/each}
		</ul>
	{/if}
</div>

<BottomSheet bind:open={editorOpen} title={editing ? 'Edit address' : 'Add address'}>
	<div class="space-y-4 px-1 pb-2 pt-3">
		<AddressForm value={draft} disabled={saving} />
		{#if errorMsg}<p class="text-sm text-destructive">{errorMsg}</p>{/if}
		<div class="flex justify-end gap-2">
			<Button variant="outline" disabled={saving} onclick={() => (editorOpen = false)}
				>Cancel</Button
			>
			<JetEngineButton
				label="Save address"
				loadingLabel="Saving…"
				successLabel="Saved"
				state={saving ? 'loading' : 'idle'}
				onclick={save}
			/>
		</div>
	</div>
</BottomSheet>

<ConfirmDialog
	bind:open={confirmOpen}
	title="Delete address?"
	description="The address will be removed from this contact."
	confirmLabel="Delete"
	variant="destructive"
	loading={deleting}
	onConfirm={confirmDelete}
/>
