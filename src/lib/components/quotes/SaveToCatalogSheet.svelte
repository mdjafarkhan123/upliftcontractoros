<script lang="ts">
	import * as Sheet from '$lib/components/ui/sheet';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Textarea } from '$lib/components/ui/textarea';
	import UnitCombobox from './UnitCombobox.svelte';
	import { toast } from '$lib/stores/toast.svelte';
	import { catalogStore } from '$lib/stores/catalog.svelte';
	import { BookmarkPlus, AlertTriangle } from '@lucide/svelte';

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
	<Sheet.Content side="right" class="flex w-full flex-col gap-0 p-0 sm:max-w-md">
		<Sheet.Header class="border-b border-border/60 px-4 py-3 text-left">
			<Sheet.Title class="flex items-center gap-2 text-base">
				<BookmarkPlus class="h-4 w-4 text-primary" />
				Save to price book
			</Sheet.Title>
		</Sheet.Header>

		<div class="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
			{#if duplicateId}
				<div class="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
					<div class="flex items-start gap-3">
						<div
							class="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-300"
						>
							<AlertTriangle class="h-4 w-4" />
						</div>
						<div class="min-w-0 flex-1">
							<p class="text-sm font-semibold text-amber-800 dark:text-amber-200">
								An item named “{name.trim()}” already exists
							</p>
							<p class="mt-1 text-sm text-amber-900/90 dark:text-amber-100/90">
								Update the existing item with these values, or save this as a separate new item?
							</p>
						</div>
					</div>
				</div>
			{:else}
				<p class="text-sm text-muted-foreground">
					Save this line so you can reuse it on future quotes. Editing it later won't change quotes
					you've already sent.
				</p>
			{/if}

			<div class="grid gap-2">
				<Label for="save-name">Name <span class="text-destructive">*</span></Label>
				<Input id="save-name" bind:value={name} maxlength={200} disabled={!!duplicateId} />
				{#if fieldErrors.name}<p class="text-xs text-destructive">{fieldErrors.name}</p>{/if}
			</div>

			<div class="grid gap-2">
				<Label for="save-description">Description</Label>
				<Textarea
					id="save-description"
					bind:value={description}
					rows={2}
					maxlength={1000}
					placeholder="Optional details shown under the item"
					disabled={!!duplicateId}
				/>
			</div>

			<div class="grid grid-cols-2 gap-3">
				<div class="grid gap-2">
					<Label for="save-price">Price <span class="text-destructive">*</span></Label>
					<Input
						id="save-price"
						type="number"
						inputmode="decimal"
						min="0"
						step="0.01"
						bind:value={unitPrice}
						disabled={!!duplicateId}
					/>
					{#if fieldErrors.unit_price}
						<p class="text-xs text-destructive">{fieldErrors.unit_price}</p>
					{/if}
				</div>
				<div class="grid gap-2">
					<Label>Unit</Label>
					<UnitCombobox bind:value={unit} disabled={!!duplicateId} />
				</div>
			</div>

			<div class="grid grid-cols-2 gap-3">
				<div class="grid gap-2">
					<Label for="save-category">Category</Label>
					<Input
						id="save-category"
						bind:value={category}
						placeholder="e.g. Roofing"
						maxlength={100}
						disabled={!!duplicateId}
					/>
				</div>
				<div class="grid gap-2">
					<Label for="save-cost">Cost <span class="text-muted-foreground">(opt)</span></Label>
					<Input
						id="save-cost"
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

		<div class="flex shrink-0 items-center justify-end gap-2 border-t border-border/60 px-4 py-3">
			{#if duplicateId}
				<Button variant="outline" disabled={saving} onclick={() => void saveAsNew()}>
					Save as new
				</Button>
				<Button disabled={saving} onclick={() => void updateExisting()}>
					{saving ? 'Saving…' : 'Update existing'}
				</Button>
			{:else}
				<Button variant="outline" onclick={() => (open = false)}>Cancel</Button>
				<Button disabled={saving || !name.trim()} onclick={() => void save()}>
					{saving ? 'Saving…' : 'Save item'}
				</Button>
			{/if}
		</div>
	</Sheet.Content>
</Sheet.Root>
