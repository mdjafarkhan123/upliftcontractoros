<script lang="ts">
	import PageWrapper from '$lib/components/shared/PageWrapper.svelte';
	import SkeletonLoader from '$lib/components/shared/SkeletonLoader.svelte';
	import { Button } from '$lib/components/ui/button';
	import JetEngineButton from '$lib/components/shared/JetEngineButton.svelte';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Textarea } from '$lib/components/ui/textarea';
	import LineItemEditor from '$lib/components/quotes/LineItemEditor.svelte';
	import InvoiceStatusBadge from '$lib/components/invoices/InvoiceStatusBadge.svelte';
	import InvoiceTotalsCard from '$lib/components/invoices/InvoiceTotalsCard.svelte';
	import PaymentHistory from '$lib/components/invoices/PaymentHistory.svelte';
	import AttachmentList from '$lib/components/media/AttachmentList.svelte';
	import { toast } from '$lib/stores/toast.svelte';
	import { invoicesStore } from '$lib/stores/invoices.svelte';
	import { isEffectivelyOverdue } from '$lib/utils/invoices';
	import { Calendar } from '$lib/components/ui/calendar';
	import { getMemberContext } from '$lib/context/member';
	import {
		AlertCircle,
		Ban,
		Check,
		CreditCard,
		Download,
		Link as LinkIcon,
		Save,
		Send
	} from '@lucide/svelte';
	import { formatCurrency, formatDate } from '$lib/utils/format';
	import type { PageData } from './$types';
	import type { InvoiceDetail, InvoiceLineItemRow } from '$lib/types/invoices';
	import type { QuoteLineDraft } from '$lib/types/quotes';

	let { data }: { data: PageData } = $props();

	const member = getMemberContext();
	const invoice = $derived(invoicesStore.getDetail(data.id));
	const detailStatus = $derived(invoicesStore.getDetailStatus(data.id));
	const detailError = $derived(invoicesStore.getDetailError(data.id));
	const showSkeleton = $derived(!invoice && detailStatus !== 'error');

	function toDrafts(rows: InvoiceLineItemRow[]): QuoteLineDraft[] {
		return rows.map((li) => ({
			client_id: li.id,
			description: li.description,
			quantity: li.quantity,
			unit_price: li.unit_price
		}));
	}

	let lineItems = $state<QuoteLineDraft[]>([]);
	let titleDraft = $state('');
	let taxRateDraft = $state('0');
	let dueDateDraft = $state('');
	let notesDraft = $state('');
	let initializedForId = $state<string | null>(null);

	function initDrafts(i: InvoiceDetail) {
		lineItems = toDrafts(i.line_items);
		titleDraft = i.title;
		taxRateDraft = String(Number(i.tax_rate) * 100);
		dueDateDraft = i.due_date ?? '';
		notesDraft = i.notes ?? '';
		initializedForId = i.id;
	}

	$effect(() => {
		void invoicesStore.loadDetail(data.id);
	});

	$effect(() => {
		if (invoice && initializedForId !== invoice.id) {
			initDrafts(invoice);
		}
	});

	let sendOpen = $state(false);
	let paymentOpen = $state(false);
	let linkOpen = $state(false);
	let cancelOpen = $state(false);
	let saving = $state(false);
	let cancelling = $state(false);

	const isDraft = $derived(invoice?.status === 'draft');
	const isCancelled = $derived(invoice?.status === 'cancelled');
	const isPaid = $derived(invoice?.status === 'paid');
	const canCollect = $derived(
		invoice && !isDraft && !isCancelled && !isPaid && Number(invoice.amount_due) > 0
	);
	const overdue = $derived(
		invoice ? isEffectivelyOverdue(invoice.status, invoice.due_date, invoice.amount_due) : false
	);
	const depositPayment = $derived(
		invoice?.payments?.find(
			(p) => p.payment_method === 'stripe' && p.notes?.startsWith('Deposit applied from Quote')
		) ?? null
	);

	const subtotal = $derived(
		lineItems.reduce((s, li) => {
			const q = Number(li.quantity);
			const p = Number(li.unit_price);
			if (!Number.isFinite(q) || !Number.isFinite(p)) return s;
			return s + Math.round(q * p * 100) / 100;
		}, 0)
	);
	const taxRateNum = $derived.by(() => {
		const n = Number(taxRateDraft);
		return Number.isFinite(n) ? n / 100 : 0;
	});
	const taxAmount = $derived(Math.round(subtotal * taxRateNum * 100) / 100);
	const total = $derived(Math.round((subtotal + subtotal * taxRateNum) * 100) / 100);

	const dirty = $derived.by(() => {
		if (!invoice) return false;
		if (titleDraft.trim() !== invoice.title) return true;
		if (notesDraft.trim() !== (invoice.notes ?? '')) return true;
		if (dueDateDraft !== (invoice.due_date ?? '')) return true;
		const currentTaxPct = String(Number(invoice.tax_rate) * 100);
		if (Number(taxRateDraft) !== Number(currentTaxPct)) return true;
		const orig = invoice.line_items;
		if (lineItems.length !== orig.length) return true;
		for (let i = 0; i < lineItems.length; i++) {
			const a = lineItems[i];
			const b = orig[i];
			if (a.description !== b.description) return true;
			if (Number(a.quantity) !== Number(b.quantity)) return true;
			if (Number(a.unit_price) !== Number(b.unit_price)) return true;
		}
		return false;
	});

	let pdfBusy = $state(false);
	async function downloadPdf() {
		if (!invoice || pdfBusy) return;
		pdfBusy = true;
		try {
			const res = await fetch(`/api/invoices/${invoice.id}/pdf`, { method: 'POST' });
			const body = await res.json().catch(() => ({}));
			if (!res.ok || !body.data?.url) {
				toast.error(body.error ?? 'Could not generate PDF');
				return;
			}
			window.open(body.data.url as string, '_blank');
		} finally {
			pdfBusy = false;
		}
	}

	async function refresh() {
		await invoicesStore.loadDetail(data.id, true);
		const latest = invoicesStore.getDetail(data.id);
		if (latest) {
			initDrafts(latest);
			invoicesStore.update({
				id: latest.id,
				status: latest.status,
				total: latest.total,
				amount_paid: latest.amount_paid,
				amount_due: latest.amount_due,
				sent_at: latest.sent_at,
				paid_at: latest.paid_at
			});
		}
	}

	async function save() {
		if (!invoice || !isDraft) return;
		if (!titleDraft.trim()) {
			toast.error('Title is required');
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
			const res = await fetch(`/api/invoices/${invoice.id}`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					title: titleDraft.trim(),
					tax_rate: Number.isFinite(taxRateNum) ? taxRateNum : 0,
					due_date: dueDateDraft.trim() || null,
					notes: notesDraft.trim() || null,
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
				toast.error(body.error ?? 'Failed to save');
				return;
			}
			await refresh();
			toast.success('Invoice saved');
		} catch {
			toast.error('Network error');
		} finally {
			saving = false;
		}
	}

	// All four dialogs are click-gated — load them lazily so the invoice detail
	// shell paints instantly; each chunk fetches the first time it opens.
	let SendInvoiceDialog =
		$state<typeof import('$lib/components/invoices/SendInvoiceDialog.svelte').default | null>(null);
	$effect(() => {
		if (!sendOpen || SendInvoiceDialog) return;
		void import('$lib/components/invoices/SendInvoiceDialog.svelte').then((m) => {
			SendInvoiceDialog = m.default;
		});
	});

	let RecordPaymentDialog =
		$state<typeof import('$lib/components/invoices/RecordPaymentDialog.svelte').default | null>(null);
	$effect(() => {
		if (!paymentOpen || RecordPaymentDialog) return;
		void import('$lib/components/invoices/RecordPaymentDialog.svelte').then((m) => {
			RecordPaymentDialog = m.default;
		});
	});

	let PaymentLinkDialog =
		$state<typeof import('$lib/components/invoices/PaymentLinkDialog.svelte').default | null>(null);
	$effect(() => {
		if (!linkOpen || PaymentLinkDialog) return;
		void import('$lib/components/invoices/PaymentLinkDialog.svelte').then((m) => {
			PaymentLinkDialog = m.default;
		});
	});

	let ConfirmDialog =
		$state<typeof import('$lib/components/shared/ConfirmDialog.svelte').default | null>(null);
	$effect(() => {
		if (!cancelOpen || ConfirmDialog) return;
		void import('$lib/components/shared/ConfirmDialog.svelte').then((m) => {
			ConfirmDialog = m.default;
		});
	});

	async function cancelInvoice() {
		if (!invoice) return;
		cancelling = true;
		try {
			const res = await fetch(`/api/invoices/${invoice.id}/cancel`, { method: 'POST' });
			const body = await res.json().catch(() => ({}));
			if (!res.ok) {
				toast.error(body.error ?? 'Failed to cancel');
				return;
			}
			toast.success('Invoice cancelled');
			await refresh();
		} finally {
			cancelling = false;
		}
	}
</script>

<svelte:head><title>{invoice ? invoice.invoice_number_display : 'Invoice'}</title></svelte:head>

{#if showSkeleton}
	<PageWrapper title="Invoice" back="/invoices">
		<div class="grid gap-4">
			<div class="rounded-xl border border-border bg-card p-4">
				<SkeletonLoader lines={3} />
			</div>
			<div class="rounded-xl border border-border bg-card p-4">
				<SkeletonLoader lines={4} />
			</div>
			<div class="rounded-xl border border-border bg-card p-4">
				<SkeletonLoader lines={5} />
			</div>
		</div>
	</PageWrapper>
{:else if !invoice}
	<PageWrapper title="Invoice" back="/invoices">
		<p class="text-sm text-destructive">{detailError ?? 'Not found'}</p>
	</PageWrapper>
{:else}
	{@const inv = invoice}
	<PageWrapper title={inv.invoice_number_display} back="/invoices">
		{#snippet actions()}
			{#if isDraft}
				<JetEngineButton
					label="Save"
					loadingLabel="Saving…"
					successLabel="Saved"
					state={saving ? 'loading' : 'idle'}
					disabled={!dirty}
					onclick={save}
				>
					{#snippet icon()}<Save class="h-4 w-4" />{/snippet}
				</JetEngineButton>
				<Button
					variant="outline"
					onclick={() => (sendOpen = true)}
					disabled={lineItems.length === 0 || dirty}
				>
					<Send class="mr-1 h-4 w-4" />Send
				</Button>
			{/if}
			{#if canCollect}
				<Button variant="outline" onclick={() => (linkOpen = true)}>
					<LinkIcon class="mr-1 h-4 w-4" />Payment link
				</Button>
				<Button onclick={() => (paymentOpen = true)}>
					<CreditCard class="mr-1 h-4 w-4" />Record payment
				</Button>
			{/if}
			{#if !isDraft}
				<Button variant="outline" onclick={downloadPdf} disabled={pdfBusy}>
					<Download class="mr-1 h-4 w-4" />{pdfBusy ? 'Preparing…' : 'PDF'}
				</Button>
			{/if}
		{/snippet}

		<div class="grid gap-4">
			<div class="rounded-xl border border-border bg-card p-4">
				<div class="flex items-start justify-between gap-3">
					<div class="min-w-0">
						<div class="flex flex-wrap items-center gap-2">
							<InvoiceStatusBadge status={inv.status} />
							{#if overdue}
								<span
									class="inline-flex items-center gap-1 rounded-full bg-rose-500/15 px-2 py-0.5 text-xs font-medium text-rose-600 dark:text-rose-400"
								>
									<AlertCircle class="h-3 w-3" />Overdue
								</span>
							{/if}
							{#if inv.due_date && !isPaid && !isCancelled}
								<span
									class={'text-xs ' +
										(overdue ? 'text-rose-600 dark:text-rose-400' : 'text-muted-foreground')}
								>
									Due {new Date(inv.due_date).toLocaleDateString('en-US')}
								</span>
							{/if}
						</div>
						<p class="mt-2 text-sm text-muted-foreground">{inv.contact_name}</p>
						<p class="text-xs text-muted-foreground">
							{inv.contact_phone}{inv.contact_email ? ` · ${inv.contact_email}` : ''}
						</p>
					</div>
					{#if !isDraft && !isCancelled && !isPaid}
						<button
							type="button"
							onclick={() => (cancelOpen = true)}
							disabled={cancelling}
							class="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-destructive disabled:opacity-50"
							aria-label="Cancel invoice"
						>
							<Ban class="h-4 w-4" />
						</button>
					{/if}
				</div>
			</div>

			<div class="grid gap-2 rounded-xl border border-border bg-card p-4">
				<Label for="invoice-title">Title</Label>
				<Input id="invoice-title" bind:value={titleDraft} disabled={!isDraft} />
				<div class="grid grid-cols-2 gap-3">
					<div class="grid gap-2">
						<Label for="invoice-tax" class="mt-2">Tax rate (%)</Label>
						<Input
							id="invoice-tax"
							type="number"
							inputmode="decimal"
							min="0"
							max="100"
							step="0.01"
							bind:value={taxRateDraft}
							disabled={!isDraft}
						/>
					</div>
					<div class="grid gap-2">
						<Label class="mt-2">Due date</Label>
						<Calendar bind:value={dueDateDraft} placeholder="Pick due date" disabled={!isDraft} />
					</div>
				</div>
				<Label for="invoice-notes" class="mt-2">Notes</Label>
				<Textarea id="invoice-notes" bind:value={notesDraft} rows={3} disabled={!isDraft} />
			</div>

			<div class="space-y-3">
				<h2 class="text-sm font-semibold">Line items</h2>
				<LineItemEditor bind:lineItems readonly={!isDraft} />
			</div>

			{#if depositPayment}
				<div class="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
					<div class="flex items-start gap-3">
						<div
							class="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-700 dark:text-emerald-300"
						>
							<Check class="h-4 w-4" />
						</div>
						<div class="min-w-0 flex-1">
							<p class="text-sm font-semibold text-emerald-800 dark:text-emerald-200">
								Deposit applied
							</p>
							<p class="mt-1 text-sm text-emerald-900/90 dark:text-emerald-100/90">
								{formatCurrency(depositPayment.amount)} · collected {formatDate(
									depositPayment.paid_at
								)} · via Stripe
							</p>
						</div>
					</div>
				</div>
			{/if}

			<InvoiceTotalsCard
				subtotal={isDraft ? subtotal.toFixed(2) : inv.subtotal}
				tax_rate={isDraft ? taxRateNum.toFixed(4) : inv.tax_rate}
				tax_amount={isDraft ? taxAmount.toFixed(2) : inv.tax_amount}
				total={isDraft ? total.toFixed(2) : inv.total}
				amount_paid={isDraft ? null : inv.amount_paid}
				amount_due={isDraft ? null : inv.amount_due}
			/>

			{#if !isDraft}
				<PaymentHistory payments={inv.payments} />
			{/if}

			<AttachmentList
				parentFk={{ invoice_id: inv.id }}
				purposeTag="invoice_attachment"
				canUpload={member().can_upload_files}
				canDelete={member().can_upload_files}
			/>
		</div>

		{#if SendInvoiceDialog}
			<SendInvoiceDialog
				bind:open={sendOpen}
				invoiceId={inv.id}
				invoiceNumberDisplay={inv.invoice_number_display}
				total={inv.total}
				amountDue={inv.amount_due}
				contactName={inv.contact_name}
				contactEmail={inv.contact_email}
				contactPhone={inv.contact_phone}
				dueDate={inv.due_date}
				onSent={() => {
					void refresh();
				}}
			/>
		{/if}

		{#if RecordPaymentDialog}
			<RecordPaymentDialog
				bind:open={paymentOpen}
				invoiceId={inv.id}
				amountDue={inv.amount_due}
				onRecorded={() => {
					void refresh();
				}}
			/>
		{/if}

		{#if PaymentLinkDialog}
			<PaymentLinkDialog
				bind:open={linkOpen}
				invoiceId={inv.id}
				existingUrl={inv.stripe_payment_link_url}
			/>
		{/if}

		{#if ConfirmDialog}
			<ConfirmDialog
				bind:open={cancelOpen}
				title="Cancel invoice?"
				description="The customer will no longer be able to pay this invoice. This cannot be undone."
				confirmLabel="Cancel invoice"
				cancelLabel="Keep open"
				variant="destructive"
				loading={cancelling}
				onConfirm={cancelInvoice}
			/>
		{/if}
	</PageWrapper>
{/if}
