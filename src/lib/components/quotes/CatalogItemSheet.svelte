<script lang="ts">
	import * as Sheet from '$lib/components/ui/sheet';
	import { Button } from '$lib/components/ui/button';
	import { Switch } from '$lib/components/ui/switch';
	import UnitCombobox from './UnitCombobox.svelte';
	import { toast } from '$lib/stores/toast.svelte';
	import { catalogStore } from '$lib/stores/catalog.svelte';
	import type { CatalogItem } from '$lib/types/quotes';

	let {
		open = $bindable(false),
		item = null,
		onSaved
	}: {
		open?: boolean;
		item?: CatalogItem | null;
		onSaved?: () => void;
	} = $props();

	let name = $state('');
	let category = $state('');
	let unit = $state('');
	let unitPrice = $state('');
	let unitCost = $state('');
	let description = $state('');
	let defaultTaxable = $state(true);
	let saving = $state(false);
	let fieldErrors = $state<Record<string, string>>({});

	// Image state
	let imageUrl = $state<string | null>(null); // signed URL for display (existing item)
	let imageR2Key = $state<string | null>(null); // r2 key to save (new upload)
	let imagePreview = $state<string | null>(null); // local blob URL for instant preview
	let imageUploading = $state(false);
	let fileInput: HTMLInputElement | undefined = $state();

	const isEdit = $derived(item !== null);
	const displayImage = $derived(imagePreview ?? imageUrl);

	$effect(() => {
		if (!open) return;
		name = item?.name ?? '';
		category = item?.category ?? '';
		unit = item?.unit ?? '';
		unitPrice = item?.unit_price ?? '';
		unitCost = item?.unit_cost ?? '';
		description = item?.description ?? '';
		defaultTaxable = item?.default_taxable ?? true;
		imageUrl = item?.image_url ?? null;
		imageR2Key = null;
		imagePreview = null;
		fieldErrors = {};
	});

	function pickImage() {
		if (imageUploading) return;
		fileInput?.click();
	}

	function onFileChange(e: Event) {
		const target = e.currentTarget as HTMLInputElement;
		const file = target.files?.[0];
		target.value = '';
		if (!file) return;
		void uploadImage(file);
	}

	async function uploadImage(file: File) {
		const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp']);
		if (!ALLOWED.has(file.type)) {
			toast.error('Image must be JPEG, PNG, or WebP');
			return;
		}
		if (file.size > 5 * 1024 * 1024) {
			toast.error('Image must be under 5 MB');
			return;
		}

		// Show local preview immediately
		imagePreview = URL.createObjectURL(file);
		imageUploading = true;

		try {
			const fd = new FormData();
			fd.append('file', file);
			fd.append('purpose_tag', 'catalog_item_photo');

			const res = await fetch('/api/media/upload', { method: 'POST', body: fd });
			const body = (await res.json().catch(() => ({}))) as {
				data?: { thumbnail_key?: string; r2_key?: string };
				error?: string;
			};
			if (!res.ok) {
				toast.error(body.error ?? 'Image upload failed');
				imagePreview = null;
				return;
			}
			imageR2Key = body.data?.thumbnail_key ?? body.data?.r2_key ?? null;
		} catch {
			toast.error('Image upload failed');
			imagePreview = null;
		} finally {
			imageUploading = false;
		}
	}

	function removeImage() {
		imagePreview = null;
		imageUrl = null;
		imageR2Key = null;
	}

	async function save() {
		if (saving) return;
		fieldErrors = {};
		if (!name.trim()) {
			fieldErrors = { name: 'Name is required' };
			return;
		}
		if (unitPrice.trim() === '' || !Number.isFinite(Number(unitPrice)) || Number(unitPrice) < 0) {
			fieldErrors = { unit_price: 'Enter a valid price' };
			return;
		}
		saving = true;
		try {
			// image_url to send: new upload key takes priority, then existing (null to clear)
			const resolvedImageUrl = imageR2Key !== null ? imageR2Key : imageUrl;

			const payload = {
				name: name.trim(),
				category: category.trim() || null,
				unit: unit.trim() || null,
				unit_price: Number(unitPrice),
				unit_cost: unitCost.trim() === '' ? null : Number(unitCost),
				description: description.trim() || null,
				default_taxable: defaultTaxable,
				image_url: resolvedImageUrl
			};
			const res = await fetch(isEdit ? `/api/catalog-items/${item!.id}` : '/api/catalog-items', {
				method: isEdit ? 'PATCH' : 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(payload)
			});
			const body = (await res.json().catch(() => ({}))) as {
				error?: string;
				field_errors?: Record<string, string>;
			};
			if (!res.ok) {
				fieldErrors = body.field_errors ?? {};
				toast.error(body.error ?? 'Could not save item');
				return;
			}
			await catalogStore.refetch();
			toast.success(isEdit ? 'Item updated' : 'Item added to price book');
			open = false;
			onSaved?.();
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
			<Sheet.Title class="sheet-form__title"
				>{isEdit ? 'Edit item' : 'New price book item'}</Sheet.Title
			>
		</div>

		<div class="sheet-form__body">
			<!-- Image upload -->
			<div class="field">
				<span class="field__label">Photo <span class="field__hint">(optional)</span></span>
				<div class="catalog-item__photo-row">
					{#if displayImage}
						<div class="catalog-item__photo">
							<img src={displayImage} alt="Item" />
							{#if imageUploading}
								<div class="catalog-item__photo-overlay">
									<i class="ri-loader-4-line" aria-hidden="true"></i>
								</div>
							{/if}
							{#if !imageUploading}
								<button
									type="button"
									onclick={removeImage}
									aria-label="Remove image"
									class="catalog-item__photo-remove"
								>
									<i class="ri-close-line" aria-hidden="true"></i>
								</button>
							{/if}
						</div>
					{:else}
						<button
							type="button"
							onclick={pickImage}
							disabled={imageUploading}
							class="catalog-item__photo-add"
						>
							{#if imageUploading}
								<i class="ri-loader-4-line animate-spin" aria-hidden="true"></i>
							{:else}
								<i class="ri-image-add-line" aria-hidden="true"></i>
								<span>Add photo</span>
							{/if}
						</button>
					{/if}
					{#if displayImage && !imageUploading}
						<button type="button" onclick={pickImage} class="catalog-item__photo-change">
							Change photo
						</button>
					{/if}
				</div>
				<p class="field__hint">JPEG, PNG, or WebP · max 5 MB</p>
			</div>

			<div class="field">
				<label for="cat-name" class="field__label field__label--required">Name</label>
				<input
					id="cat-name"
					class="field__input"
					bind:value={name}
					placeholder="e.g. Architectural shingle install"
					maxlength={200}
				/>
				{#if fieldErrors.name}<p class="field__error">{fieldErrors.name}</p>{/if}
			</div>

			<div class="sheet-form__grid">
				<div class="field">
					<label for="cat-price" class="field__label field__label--required">Price</label>
					<input
						id="cat-price"
						class="field__input"
						type="number"
						inputmode="decimal"
						min="0"
						step="0.01"
						bind:value={unitPrice}
						placeholder="0.00"
					/>
					{#if fieldErrors.unit_price}
						<p class="field__error">{fieldErrors.unit_price}</p>
					{/if}
				</div>
				<div class="field">
					<span class="field__label">Unit</span>
					<UnitCombobox bind:value={unit} />
				</div>
			</div>

			<div class="sheet-form__grid">
				<div class="field">
					<label for="cat-category" class="field__label">Category</label>
					<input
						id="cat-category"
						class="field__input"
						bind:value={category}
						placeholder="e.g. Roofing"
						maxlength={100}
					/>
				</div>
				<div class="field">
					<label for="cat-cost" class="field__label"
						>Cost <span class="field__hint">(optional)</span></label
					>
					<input
						id="cat-cost"
						class="field__input"
						type="number"
						inputmode="decimal"
						min="0"
						step="0.01"
						bind:value={unitCost}
						placeholder="0.00"
					/>
				</div>
			</div>
			<p class="sheet-form__hint">
				Cost is what the item costs your business. It stays private and is never shown to clients —
				it's there for future profit reporting.
			</p>

			<div class="field">
				<label for="cat-desc" class="field__label">Description</label>
				<textarea
					id="cat-desc"
					class="field__textarea"
					bind:value={description}
					rows={3}
					placeholder="Optional detail shown on the quote line"
					maxlength={1000}
				></textarea>
			</div>

			<div class="catalog-item__tax-row">
				<div class="catalog-item__tax-text">
					<label for="cat-taxable" class="field__label">Taxable by default</label>
					<p class="field__hint">
						Turn off for labor-only items so tax isn't added when they're used on a quote or invoice.
						Materials are usually taxable; labor usually isn't.
					</p>
				</div>
				<Switch id="cat-taxable" bind:checked={defaultTaxable} />
			</div>
		</div>

		<div class="sheet-form__footer">
			<Button variant="outline" onclick={() => (open = false)}>Cancel</Button>
			<Button
				loading={saving}
				loadingLabel="Saving…"
				disabled={imageUploading || !name.trim()}
				onclick={() => void save()}
			>
				{isEdit ? 'Save changes' : 'Add item'}
			</Button>
		</div>
	</Sheet.Content>
</Sheet.Root>

<input
	bind:this={fileInput}
	type="file"
	accept="image/jpeg,image/png,image/webp"
	class="catalog-item__file"
	onchange={onFileChange}
/>
