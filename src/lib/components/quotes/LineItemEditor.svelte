<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { formatCurrency } from '$lib/utils/format';
	import { Trash2, Plus } from '@lucide/svelte';
	import type { QuoteLineDraft } from '$lib/types/quotes';

	let {
		lineItems = $bindable<QuoteLineDraft[]>([]),
		readonly = false
	}: {
		lineItems?: QuoteLineDraft[];
		readonly?: boolean;
	} = $props();

	let draftDescription = $state('');
	let draftQuantity = $state('1');
	let draftUnitPrice = $state('');

	function lineTotal(li: QuoteLineDraft): number {
		const q = Number(li.quantity);
		const p = Number(li.unit_price);
		if (!Number.isFinite(q) || !Number.isFinite(p)) return 0;
		return Math.round(q * p * 100) / 100;
	}

	function addLineItem() {
		const description = draftDescription.trim();
		const quantity = Number(draftQuantity);
		const unitPrice = Number(draftUnitPrice);
		if (!description) return;
		if (!Number.isFinite(quantity) || quantity <= 0) return;
		if (!Number.isFinite(unitPrice) || unitPrice < 0) return;

		lineItems = [
			...lineItems,
			{
				client_id: crypto.randomUUID(),
				description,
				quantity: String(quantity),
				unit_price: unitPrice.toFixed(2)
			}
		];
		draftDescription = '';
		draftQuantity = '1';
		draftUnitPrice = '';
	}

	function removeItem(client_id: string) {
		lineItems = lineItems.filter((x) => x.client_id !== client_id);
	}

	function updateField(client_id: string, patch: Partial<QuoteLineDraft>) {
		lineItems = lineItems.map((x) => (x.client_id === client_id ? { ...x, ...patch } : x));
	}
</script>

<div class="space-y-3">
	{#each lineItems as li (li.client_id)}
		<div class="rounded-xl border border-border bg-card p-3">
			<div class="space-y-2">
				<Input
					value={li.description}
					disabled={readonly}
					oninput={(e: Event) =>
						updateField(li.client_id, {
							description: (e.currentTarget as HTMLInputElement).value
						})}
					placeholder="Description"
				/>
				<div class="grid grid-cols-12 items-center gap-2">
					<div class="col-span-3">
						<Input
							type="number"
							inputmode="decimal"
							min="0"
							step="0.01"
							value={li.quantity}
							disabled={readonly}
							oninput={(e: Event) =>
								updateField(li.client_id, {
									quantity: (e.currentTarget as HTMLInputElement).value
								})}
						/>
					</div>
					<div class="col-span-5">
						<Input
							type="number"
							inputmode="decimal"
							min="0"
							step="0.01"
							value={li.unit_price}
							disabled={readonly}
							oninput={(e: Event) =>
								updateField(li.client_id, {
									unit_price: (e.currentTarget as HTMLInputElement).value
								})}
						/>
					</div>
					<div class="col-span-3 text-right text-sm font-medium tabular-nums">
						{formatCurrency(lineTotal(li))}
					</div>
					<div class="col-span-1 flex justify-end">
						{#if !readonly}
							<button
								type="button"
								class="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-destructive"
								onclick={() => removeItem(li.client_id)}
								aria-label="Remove line item"
							>
								<Trash2 class="h-4 w-4" />
							</button>
						{/if}
					</div>
				</div>
			</div>
		</div>
	{/each}

	{#if !readonly}
		<div class="rounded-xl border border-dashed border-border bg-card p-3">
			<div class="space-y-2">
				<Input bind:value={draftDescription} placeholder="Add a line item description" />
				<div class="grid grid-cols-12 gap-2">
					<div class="col-span-3">
						<Input
							type="number"
							inputmode="decimal"
							min="0"
							step="0.01"
							bind:value={draftQuantity}
							placeholder="Qty"
						/>
					</div>
					<div class="col-span-5">
						<Input
							type="number"
							inputmode="decimal"
							min="0"
							step="0.01"
							bind:value={draftUnitPrice}
							placeholder="Unit price"
						/>
					</div>
					<div class="col-span-4">
						<Button class="w-full" disabled={!draftDescription.trim()} onclick={addLineItem}>
							<Plus class="mr-1 h-4 w-4" />Add
						</Button>
					</div>
				</div>
			</div>
		</div>
	{/if}
</div>
