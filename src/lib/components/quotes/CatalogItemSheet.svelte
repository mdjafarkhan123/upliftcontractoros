<script lang="ts">
	import * as Sheet from '$lib/components/ui/sheet';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Textarea } from '$lib/components/ui/textarea';
	import UnitCombobox from './UnitCombobox.svelte';
	import { toast } from '$lib/stores/toast.svelte';
	import { catalogStore } from '$lib/stores/catalog.svelte';
	import type { CatalogItem } from '$lib/types/quotes';
	import { ImagePlus, X, Loader2 } from '@lucide/svelte';

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
				image_url: resolvedImageUrl
			};
			const res = await fetch(
				isEdit ? `/api/catalog-items/${item!.id}` : '/api/catalog-items',
				{
					method: isEdit ? 'PATCH' : 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify(payload)
				}
			);
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
	<Sheet.Content side="right" class="flex w-full flex-col gap-0 p-0 sm:max-w-md">
		<Sheet.Header class="border-b border-border/60 px-4 py-3 text-left">
			<Sheet.Title class="text-base">{isEdit ? 'Edit item' : 'New price book item'}</Sheet.Title>
		</Sheet.Header>

		<div class="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
			<!-- Image upload -->
			<div class="grid gap-2">
				<Label>Photo <span class="text-muted-foreground text-xs font-normal">(optional)</span></Label>
				<div class="flex items-start gap-3">
					{#if displayImage}
						<div class="relative shrink-0">
							<img
								src={displayImage}
								alt="Item"
								class="h-20 w-20 rounded-lg border border-border/60 object-cover shadow-sm"
							/>
							{#if imageUploading}
								<div class="absolute inset-0 flex items-center justify-center rounded-lg bg-black/40">
									<Loader2 class="h-5 w-5 animate-spin text-white" />
								</div>
							{/if}
							{#if !imageUploading}
								<button
									type="button"
									onclick={removeImage}
									aria-label="Remove image"
									class="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-white shadow"
								>
									<X class="h-3 w-3" />
								</button>
							{/if}
						</div>
					{:else}
						<button
							type="button"
							onclick={pickImage}
							disabled={imageUploading}
							class="flex h-20 w-20 shrink-0 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-border/60 bg-muted/30 text-muted-foreground transition-colors hover:border-primary/50 hover:bg-primary/5 hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
						>
							{#if imageUploading}
								<Loader2 class="h-5 w-5 animate-spin" />
							{:else}
								<ImagePlus class="h-5 w-5" />
								<span class="text-[10px] font-medium">Add photo</span>
							{/if}
						</button>
					{/if}
					{#if displayImage && !imageUploading}
						<button
							type="button"
							onclick={pickImage}
							class="mt-1 text-xs text-primary underline-offset-2 hover:underline"
						>
							Change photo
						</button>
					{/if}
				</div>
				<p class="text-xs text-muted-foreground">JPEG, PNG, or WebP · max 5 MB</p>
			</div>

			<div class="grid gap-2">
				<Label for="cat-name">Name <span class="text-destructive">*</span></Label>
				<Input
					id="cat-name"
					bind:value={name}
					placeholder="e.g. Architectural shingle install"
					maxlength={200}
				/>
				{#if fieldErrors.name}<p class="text-xs text-destructive">{fieldErrors.name}</p>{/if}
			</div>

			<div class="grid grid-cols-2 gap-3">
				<div class="grid gap-2">
					<Label for="cat-price">Price <span class="text-destructive">*</span></Label>
					<Input
						id="cat-price"
						type="number"
						inputmode="decimal"
						min="0"
						step="0.01"
						bind:value={unitPrice}
						placeholder="0.00"
					/>
					{#if fieldErrors.unit_price}
						<p class="text-xs text-destructive">{fieldErrors.unit_price}</p>
					{/if}
				</div>
				<div class="grid gap-2">
					<Label>Unit</Label>
					<UnitCombobox bind:value={unit} />
				</div>
			</div>

			<div class="grid grid-cols-2 gap-3">
				<div class="grid gap-2">
					<Label for="cat-category">Category</Label>
					<Input
						id="cat-category"
						bind:value={category}
						placeholder="e.g. Roofing"
						maxlength={100}
					/>
				</div>
				<div class="grid gap-2">
					<Label for="cat-cost">Cost <span class="text-muted-foreground">(optional)</span></Label>
					<Input
						id="cat-cost"
						type="number"
						inputmode="decimal"
						min="0"
						step="0.01"
						bind:value={unitCost}
						placeholder="0.00"
					/>
				</div>
			</div>
			<p class="-mt-2 text-xs text-muted-foreground">
				Cost is what the item costs your business. It stays private and is never shown to clients —
				it's there for future profit reporting.
			</p>

			<div class="grid gap-2">
				<Label for="cat-desc">Description</Label>
				<Textarea
					id="cat-desc"
					bind:value={description}
					rows={3}
					placeholder="Optional detail shown on the quote line"
					maxlength={1000}
				/>
			</div>
		</div>

		<div class="flex shrink-0 items-center justify-end gap-2 border-t border-border/60 px-4 py-3">
			<Button variant="outline" onclick={() => (open = false)}>Cancel</Button>
			<Button disabled={saving || imageUploading || !name.trim()} onclick={() => void save()}>
				{saving ? 'Saving…' : isEdit ? 'Save changes' : 'Add item'}
			</Button>
		</div>
	</Sheet.Content>
</Sheet.Root>

<input
	bind:this={fileInput}
	type="file"
	accept="image/jpeg,image/png,image/webp"
	class="sr-only"
	onchange={onFileChange}
/>
