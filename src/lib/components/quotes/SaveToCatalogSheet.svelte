<script lang="ts">
	import * as Sheet from '$lib/components/ui/sheet';
	import { Button } from '$lib/components/ui/button';
	import UnitCombobox from './UnitCombobox.svelte';
	import { toast } from '$lib/stores/toast.svelte';
	import { catalogStore } from '$lib/stores/catalog.svelte';

	let {
		open = $bindable(false),
		prefill,
		onSaved
	}: {
		open?: boolean;
		// Seeded from the quote line the contractor is saving. `description` is the line title
		// (becomes the catalog item name); `details` is the longer description.
		prefill?: {
			description: string;
			details?: string | null;
			unit: string;
			unit_price: string;
			unit_cost?: string | null;
		};
		// Returns the catalog item id so the parent can link the line to it.
		onSaved?: (catalogItemId: string) => void;
	} = $props();

	let name = $state('');
	let description = $state('');
	let category = $state('');
	let unit = $state('');
	let unitPrice = $state('');
	let unitCost = $state('');
	let saving = $state(false);
	let fieldErrors = $state<Record<string, string>>({});
	// When a same-named item exists, hold its id and ask update-vs-new.
	let duplicateId = $state<string | null>(null);

	$effect(() => {
		if (!open) return;
		name = prefill?.description ?? '';
		description = prefill?.details ?? '';
		category = '';
		unit = prefill?.unit ?? '';
		unitPrice = prefill?.unit_price ?? '';
		unitCost = prefill?.unit_cost ?? '';
		fieldErrors = {};
		duplicateId = null;
	});

	function buildPayload(extra: Record<string, unknown> = {}) {
		return {
			name: name.trim(),
			description: description.trim() || null,
			category: category.trim() || null,
			unit: unit.trim() || null,
			unit_price: Number(unitPrice),
			unit_cost: unitCost.trim() === '' ? null : Number(unitCost),
			...extra
		};
	}

	function validate(): boolean {
		fieldErrors = {};
		if (!name.trim()) {
			fieldErrors = { name: 'Name is required' };
			return false;
		}
		if (unitPrice.trim() === '' || !Number.isFinite(Number(unitPrice)) || Number(unitPrice) < 0) {
			fieldErrors = { unit_price: 'Enter a valid price' };
			return false;
		}
		return true;
	}

	async function finish(id: string) {
		await catalogStore.refetch();
		toast.success('Saved to price book');
		onSaved?.(id);
		open = false;
	}

	// First attempt — POST without force. A 409 means a same-named item exists.
	async function save() {
		if (saving || !validate()) return;
		saving = true;
		try {
			const res = await fetch('/api/catalog-items', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(buildPayload())
			});
			const body = (await res.json().catch(() => ({}))) as {
				error?: string;
				field_errors?: Record<string, string>;
				data?: { id?: string; existing_item_id?: string };
			};
			if (res.status === 409 && body.data?.existing_item_id) {
				duplicateId = body.data.existing_item_id;
				return;
			}
			if (!res.ok || !body.data?.id) {
				fieldErrors = body.field_errors ?? {};
				toast.error(body.error ?? 'Could not save');
				return;
			}
			await finish(body.data.id);
		} catch {
			toast.error('Network error');
		} finally {
			saving = false;
		}
	}

	// "Update existing" — PATCH the matched item with these values.
	async function updateExisting() {
		if (saving || !duplicateId) return;
		saving = true;
		try {
			const res = await fetch(`/api/catalog-items/${duplicateId}`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(buildPayload())
			});
			const body = (await res.json().catch(() => ({}))) as { error?: string };
			if (!res.ok) {
				toast.error(body.error ?? 'Could not update');
				return;
			}
			await finish(duplicateId);
		} catch {
			toast.error('Network error');
		} finally {
			saving = false;
		}
	}

	// "Save as new" — POST again, this time forcing a duplicate.
	async function saveAsNew() {
		if (saving) return;
		saving = true;
		try {
			const res = await fetch('/api/catalog-items', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(buildPayload({ force: true }))
			});
			const body = (await res.json().catch(() => ({}))) as {
				error?: string;
				data?: { id?: string };
			};
			if (!res.ok || !body.data?.id) {
				toast.error(body.error ?? 'Could not save');
				return;
			}
			await finish(body.data.id);
		} catch {
			toast.error('Network error');
		} finally {
			saving = false;
		}
	}
</script>

<Sheet.Root bind:open>
	<Sheet.Content side="right" class="sheet-form">
		<div class="sheet-form__header">
			<Sheet.Title class="sheet-form__title">
				<i class="ri-bookmark-line" aria-hidden="true"></i>
				Save to price book
			</Sheet.Title>
		</div>

		<div class="sheet-form__body">
			{#if duplicateId}
				<div class="save-catalog__dup">
					<span class="save-catalog__dup-icon">
						<i class="ri-error-warning-line" aria-hidden="true"></i>
					</span>
					<div class="save-catalog__dup-body">
						<p class="save-catalog__dup-title">An item named “{name.trim()}” already exists</p>
						<p class="save-catalog__dup-text">
							Update the existing item with these values, or save this as a separate new item?
						</p>
					</div>
				</div>
			{:else}
				<p class="sheet-form__intro">
					Save this line so you can reuse it on future quotes. Editing it later won't change quotes
					you've already sent.
				</p>
			{/if}

			<div class="field">
				<label for="save-name" class="field__label field__label--required">Name</label>
				<input
					id="save-name"
					class="field__input"
					bind:value={name}
					maxlength={200}
					disabled={!!duplicateId}
				/>
				{#if fieldErrors.name}<p class="field__error">{fieldErrors.name}</p>{/if}
			</div>

			<div class="field">
				<label for="save-description" class="field__label">Description</label>
				<textarea
					id="save-description"
					class="field__textarea"
					bind:value={description}
					rows={2}
					maxlength={1000}
					placeholder="Optional details shown under the item"
					disabled={!!duplicateId}
				></textarea>
			</div>

			<div class="sheet-form__grid">
				<div class="field">
					<label for="save-price" class="field__label field__label--required">Price</label>
					<input
						id="save-price"
						class="field__input"
						type="number"
						inputmode="decimal"
						min="0"
						step="0.01"
						bind:value={unitPrice}
						disabled={!!duplicateId}
					/>
					{#if fieldErrors.unit_price}
						<p class="field__error">{fieldErrors.unit_price}</p>
					{/if}
				</div>
				<div class="field">
					<span class="field__label">Unit</span>
					<UnitCombobox bind:value={unit} disabled={!!duplicateId} />
				</div>
			</div>

			<div class="sheet-form__grid">
				<div class="field">
					<label for="save-category" class="field__label">Category</label>
					<input
						id="save-category"
						class="field__input"
						bind:value={category}
						placeholder="e.g. Roofing"
						maxlength={100}
						disabled={!!duplicateId}
					/>
				</div>
				<div class="field">
					<label for="save-cost" class="field__label"
						>Cost <span class="field__hint">(opt)</span></label
					>
					<input
						id="save-cost"
						class="field__input"
						type="number"
						inputmode="decimal"
						min="0"
						step="0.01"
						bind:value={unitCost}
						disabled={!!duplicateId}
					/>
				</div>
			</div>
		</div>

		<div class="sheet-form__footer">
			{#if duplicateId}
				<Button variant="outline" disabled={saving} onclick={() => void saveAsNew()}>
					Save as new
				</Button>
				<Button loading={saving} loadingLabel="Saving…" onclick={() => void updateExisting()}>
					Update existing
				</Button>
			{:else}
				<Button variant="outline" onclick={() => (open = false)}>Cancel</Button>
				<Button
					loading={saving}
					loadingLabel="Saving…"
					disabled={!name.trim()}
					onclick={() => void save()}
				>
					Save item
				</Button>
			{/if}
		</div>
	</Sheet.Content>
</Sheet.Root>
