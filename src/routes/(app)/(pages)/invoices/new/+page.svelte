<script lang="ts">
	import PageWrapper from '$lib/components/shared/PageWrapper.svelte';
	import { Button } from '$lib/components/ui/button';
	import JetEngineButton from '$lib/components/shared/JetEngineButton.svelte';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Textarea } from '$lib/components/ui/textarea';
	import ContactPickerSheet from '$lib/components/quotes/ContactPickerSheet.svelte';
	import LineItemEditor from '$lib/components/quotes/LineItemEditor.svelte';
	import InvoiceTotalsCard from '$lib/components/invoices/InvoiceTotalsCard.svelte';
	import { Calendar } from '$lib/components/ui/calendar';
	import { toast } from '$lib/stores/toast.svelte';
	import { invoicesStore } from '$lib/stores/invoices.svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { User } from '@lucide/svelte';
	import type { QuoteLineDraft } from '$lib/types/quotes';

	type ContactPick = { id: string; full_name: string; phone: string; email: string | null };

	const prefillContactId = page.url.searchParams.get('contact_id');
	const prefillContactName = page.url.searchParams.get('contact_name');
	const prefillJobId = page.url.searchParams.get('job_id');
	const prefillJobTitle = page.url.searchParams.get('job_title');

	let selectedContact = $state<ContactPick | null>(
		prefillContactId && prefillContactName
			? { id: prefillContactId, full_name: prefillContactName, phone: '', email: null }
			: null
	);
	let linkedJobId = $state<string | null>(prefillJobId);
	let title = $state(prefillJobTitle ? `${prefillJobTitle} — invoice` : '');
	let taxRatePct = $state('0');
	let dueDate = $state('');
	let notes = $state('');
	let lineItems = $state<QuoteLineDraft[]>([]);
	let pickerOpen = $state(false);
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
			const res = await fetch('/api/invoices', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					contact_id: selectedContact.id,
					job_id: linkedJobId,
					title: title.trim(),
					tax_rate: Number.isFinite(taxRate) ? taxRate : 0,
					due_date: dueDate.trim() || null,
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
				toast.error(body.error ?? 'Failed to create invoice');
				return;
			}
			invoicesStore.invalidate();
			toast.success(`${body.data.invoice_number_display} created`);
			goto(`/invoices/${body.data.id}`);
		} catch {
			toast.error('Network error');
		} finally {
			saving = false;
		}
	}
</script>

<svelte:head><title>New invoice</title></svelte:head>

<PageWrapper title="New invoice" subtitle="Build your invoice, then save once" back="/invoices">
	<div class="grid gap-5">
		<div class="grid gap-2">
			<Label>Contact <span class="text-destructive">*</span></Label>
			{#if selectedContact}
				<button
					type="button"
					class="flex items-center gap-3 rounded-lg border border-border bg-card p-3 text-left transition-colors hover:bg-accent"
					onclick={() => (pickerOpen = true)}
				>
					<div
						class="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-muted-foreground"
					>
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
			{#if linkedJobId && prefillJobTitle}
				<p class="text-xs text-muted-foreground">
					Linked to job: <span class="font-medium text-foreground">{prefillJobTitle}</span>
				</p>
			{/if}
		</div>

		<div class="grid gap-2">
			<Label for="title">Title <span class="text-destructive">*</span></Label>
			<Input id="title" bind:value={title} placeholder="e.g. Roof replacement — final" />
			{#if fieldErrors.title}<p class="text-xs text-destructive">{fieldErrors.title}</p>{/if}
		</div>

		<div class="grid grid-cols-2 gap-3">
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
				<Label for="dueDate">Due date</Label>
				<Calendar bind:value={dueDate} placeholder="Pick due date" />
			</div>
		</div>

		<div class="grid gap-2">
			<Label for="notes">Notes</Label>
			<Textarea
				id="notes"
				bind:value={notes}
				rows={4}
				placeholder="Visible to customer on the invoice"
			/>
		</div>

		<div class="space-y-3">
			<h2 class="text-sm font-semibold">Line items</h2>
			<LineItemEditor bind:lineItems />
		</div>

		<InvoiceTotalsCard
			subtotal={subtotal.toFixed(2)}
			tax_rate={taxRateNum.toFixed(4)}
			tax_amount={taxAmount.toFixed(2)}
			total={total.toFixed(2)}
		/>

		<div class="flex justify-end gap-2 pt-2">
			<Button variant="outline" onclick={() => history.back()} disabled={saving}>Cancel</Button>
			<JetEngineButton
				label="Save invoice"
				loadingLabel="Saving…"
				successLabel="Saved"
				state={saving ? 'loading' : 'idle'}
				onclick={save}
			/>
		</div>
	</div>

	<ContactPickerSheet
		bind:open={pickerOpen}
		onPick={(c) => {
			selectedContact = c;
			linkedJobId = null;
		}}
	/>
</PageWrapper>
