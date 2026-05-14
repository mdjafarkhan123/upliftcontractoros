<script lang="ts">
	import PageWrapper from '$lib/components/shared/PageWrapper.svelte';
	import { Button } from '$lib/components/ui/button';
	import JetEngineButton from '$lib/components/shared/JetEngineButton.svelte';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Textarea } from '$lib/components/ui/textarea';
	import ContactPickerSheet from '$lib/components/quotes/ContactPickerSheet.svelte';
	import LineItemEditor from '$lib/components/quotes/LineItemEditor.svelte';
	import QuoteTotalsCard from '$lib/components/quotes/QuoteTotalsCard.svelte';
	import ApplyTemplateDialog from '$lib/components/quotes/ApplyTemplateDialog.svelte';
	import { toast } from '$lib/stores/toast.svelte';
	import { quotesStore } from '$lib/stores/quotes.svelte';
	import { goto } from '$app/navigation';
	import { FileText, User } from '@lucide/svelte';
	import type { QuoteLineDraft } from '$lib/types/quotes';

	type ContactPick = { id: string; full_name: string; phone: string; email: string | null };

	let selectedContact = $state<ContactPick | null>(null);
	let title = $state('');
	let taxRatePct = $state('0');
	let notes = $state('');
	let lineItems = $state<QuoteLineDraft[]>([]);
	let pickerOpen = $state(false);
	let templateOpen = $state(false);
	let saving = $state(false);
	let fieldErrors = $state<Record<string, string>>({});

	const subtotal = $derived(
		lineItems.reduce((s, li) => {
			const q = Number(li.quantity);
			const p = Number(li.unit_price);
			if (!Number.isFinite(q) || !Number.isFinite(p)) return s;
			return s + Math.round(q * p * 100) / 100;
		}, 0)
	);
	const taxRateNum = $derived.by(() => {
		const n = Number(taxRatePct);
		return Number.isFinite(n) ? n / 100 : 0;
	});
	const taxAmount = $derived(Math.round(subtotal * taxRateNum * 100) / 100);
	const total = $derived(Math.round((subtotal + subtotal * taxRateNum) * 100) / 100);

	function onTemplateApply(items: QuoteLineDraft[]) {
		lineItems = [...lineItems, ...items];
	}

	async function save() {
		fieldErrors = {};
		if (!selectedContact) {
			fieldErrors.contact_id = 'Choose a contact';
			return;
		}
		if (!title.trim()) {
			fieldErrors.title = 'Title is required';
			return;
		}
		for (const li of lineItems) {
			const q = Number(li.quantity);
			const p = Number(li.unit_price);
			if (!li.description.trim()) {
				toast.error('Every line item needs a description');
				return;
			}
			if (!Number.isFinite(q) || q <= 0) {
				toast.error('Every line item needs a quantity greater than 0');
				return;
			}
			if (!Number.isFinite(p) || p < 0) {
				toast.error('Unit price cannot be negative');
				return;
			}
		}

		saving = true;
		try {
			const taxRate = taxRateNum;
			const res = await fetch('/api/quotes', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					contact_id: selectedContact.id,
					title: title.trim(),
					tax_rate: Number.isFinite(taxRate) ? taxRate : 0,
					notes: notes.trim() || null,
					line_items: lineItems.map((li, idx) => ({
						description: li.description.trim(),
						quantity: Number(li.quantity),
						unit_price: Number(li.unit_price),
						position: idx
					}))
				})
			});
			const body = await res.json();
			if (!res.ok) {
				if (body.field_errors) fieldErrors = body.field_errors;
				toast.error(body.error ?? 'Failed to create quote');
				return;
			}
			quotesStore.invalidate();
			toast.success(`${body.data.quote_number_display} created`);
			goto(`/quotes/${body.data.id}`);
		} catch {
			toast.error('Network error');
		} finally {
			saving = false;
		}
	}
</script>

<svelte:head><title>New quote</title></svelte:head>

<PageWrapper title="New quote" subtitle="Build your quote, then save once">
	<div class="grid max-w-xl gap-5">
		<div class="grid gap-2">
			<Label>Contact <span class="text-destructive">*</span></Label>
			{#if selectedContact}
				<button
					type="button"
					class="flex items-center gap-3 rounded-lg border border-border bg-card p-3 text-left transition-colors hover:bg-accent"
					onclick={() => (pickerOpen = true)}
				>
					<div class="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-muted-foreground">
						<User class="h-4 w-4" />
					</div>
					<div class="min-w-0 flex-1">
						<p class="truncate text-sm font-medium">{selectedContact.full_name}</p>
						<p class="truncate text-xs text-muted-foreground">{selectedContact.phone}</p>
					</div>
					<span class="text-xs text-muted-foreground">Change</span>
				</button>
			{:else}
				<Button variant="outline" onclick={() => (pickerOpen = true)}>
					<User class="mr-1 h-4 w-4" />Choose contact
				</Button>
			{/if}
			{#if fieldErrors.contact_id}
				<p class="text-xs text-destructive">{fieldErrors.contact_id}</p>
			{/if}
		</div>

		<div class="grid gap-2">
			<Label for="title">Title <span class="text-destructive">*</span></Label>
			<Input id="title" bind:value={title} placeholder="e.g. Roof replacement" />
			{#if fieldErrors.title}<p class="text-xs text-destructive">{fieldErrors.title}</p>{/if}
		</div>

		<div class="grid gap-2">
			<Label for="taxRate">Tax rate (%)</Label>
			<Input
				id="taxRate"
				type="number"
				inputmode="decimal"
				min="0"
				max="100"
				step="0.01"
				bind:value={taxRatePct}
			/>
		</div>

		<div class="grid gap-2">
			<Label for="notes">Notes</Label>
			<Textarea
				id="notes"
				bind:value={notes}
				rows={4}
				placeholder="Visible to customer on the quote"
			/>
		</div>

		<div class="space-y-3">
			<div class="flex items-center justify-between">
				<h2 class="text-sm font-semibold">Line items</h2>
				<Button variant="outline" size="sm" onclick={() => (templateOpen = true)}>
					<FileText class="mr-1 h-4 w-4" />Apply template
				</Button>
			</div>
			<LineItemEditor bind:lineItems />
		</div>

		<QuoteTotalsCard
			subtotal={subtotal.toFixed(2)}
			tax_rate={taxRateNum.toFixed(4)}
			tax_amount={taxAmount.toFixed(2)}
			total={total.toFixed(2)}
		/>

		<div class="flex justify-end gap-2 pt-2">
			<Button variant="outline" onclick={() => history.back()} disabled={saving}>Cancel</Button>
			<JetEngineButton
				label="Save quote"
				loadingLabel="Saving…"
				successLabel="Saved"
				state={saving ? 'loading' : 'idle'}
				onclick={save}
			/>
		</div>
	</div>

	<ContactPickerSheet bind:open={pickerOpen} onPick={(c) => (selectedContact = c)} />
	<ApplyTemplateDialog bind:open={templateOpen} onApply={onTemplateApply} />
</PageWrapper>
