<script lang="ts">
	import DocumentSectionCard from '$lib/components/documents/DocumentSectionCard.svelte';
	import RecordPaymentDialog from '$lib/components/invoices/RecordPaymentDialog.svelte';
	import NotifyDialog from '$lib/components/shared/NotifyDialog.svelte';
	import { toast } from '$lib/stores/toast.svelte';
	import { formatCurrency, formatDate } from '$lib/utils/format';
	import { PAYMENT_ADJUSTMENT_LABELS, PAYMENT_METHOD_LABELS } from '$lib/utils/invoices';
	import type { InvoicePaymentRow } from '$lib/types/invoices';

	let {
		invoiceId,
		invoiceNumberDisplay,
		payments,
		amountDue,
		tipsEnabled = false,
		canRecord = false,
		orgName,
		contactName,
		contactEmail = null,
		contactPhone = null,
		contactSmsOptOut = false,
		onChanged
	}: {
		invoiceId: string;
		invoiceNumberDisplay: string;
		payments: InvoicePaymentRow[];
		// Current remaining balance (total − paid).
		amountDue: string;
		tipsEnabled?: boolean;
		canRecord?: boolean;
		orgName: string;
		contactName: string;
		contactEmail?: string | null;
		contactPhone?: string | null;
		contactSmsOptOut?: boolean;
		onChanged: () => void;
	} = $props();

	const canAdd = $derived(canRecord && Number(amountDue) > 0.001);

	function isManual(p: InvoicePaymentRow): boolean {
		return p.payment_method !== 'stripe' && !p.stripe_payment_intent_id;
	}
	function remainingFor(paymentId: string, field: 'amount' | 'tip_amount'): number {
		return payments
			.filter((p) => p.id === paymentId || p.applies_to_payment_id === paymentId)
			.reduce((sum, p) => sum + Number(p[field]), 0);
	}
	function canReverse(p: InvoicePaymentRow): boolean {
		return canRecord && p.adjustment_type === 'payment' && remainingFor(p.id, 'amount') > 0.001;
	}
	function canEdit(p: InvoicePaymentRow): boolean {
		return canRecord && isManual(p) && p.adjustment_type === 'payment' && Number(p.amount) > 0.001;
	}

	// ── Add / reverse dialog ──────────────────────────────────────────────────
	let dialogOpen = $state(false);
	let dialogMode = $state<'create' | 'edit' | 'refund'>('create');
	let dialogRow = $state<InvoicePaymentRow | null>(null);
	let dialogMaxAmount = $state<string | null>(null);
	let dialogMaxTip = $state<string | null>(null);

	function openAdd() {
		dialogMode = 'create';
		dialogRow = null;
		dialogMaxAmount = null;
		dialogMaxTip = null;
		dialogOpen = true;
	}
	function openRefund(p: InvoicePaymentRow) {
		dialogMode = 'refund';
		dialogRow = p;
		dialogMaxAmount = remainingFor(p.id, 'amount').toFixed(2);
		dialogMaxTip = remainingFor(p.id, 'tip_amount').toFixed(2);
		dialogOpen = true;
	}
	function openEdit(p: InvoicePaymentRow) {
		dialogMode = 'edit';
		dialogRow = p;
		dialogMaxAmount = (Number(amountDue) + Number(p.amount)).toFixed(2);
		dialogMaxTip = null;
		dialogOpen = true;
	}
	async function deletePayment(p: InvoicePaymentRow) {
		if (!canEdit(p) || !window.confirm('Delete this manual payment? This cannot be undone.'))
			return;
		try {
			const res = await fetch(`/api/invoices/${invoiceId}/payments/${p.id}`, { method: 'DELETE' });
			const body = await res.json().catch(() => ({}));
			if (!res.ok) return toast.error(body.error ?? 'Could not delete payment');
			toast.success('Payment deleted');
			onChanged();
		} catch {
			toast.error('Network error');
		}
	}

	// ── Receipt (shared NotifyDialog) ────────────────────────────────────────
	let receiptOpen = $state(false);
	let receiptRow = $state<InvoicePaymentRow | null>(null);
	// Set right after creating a payment with "Send receipt" on; resolves to the fresh row once the
	// parent's refresh lands, then auto-opens the picker.
	let pendingReceiptId = $state<string | null>(null);

	$effect(() => {
		if (!pendingReceiptId) return;
		const found = payments.find((p) => p.id === pendingReceiptId);
		if (found) {
			receiptRow = found;
			receiptOpen = true;
			pendingReceiptId = null;
		}
	});

	function openReceipt(p: InvoicePaymentRow) {
		if (p.adjustment_type !== 'payment' || Number(p.amount) <= 0) return;
		receiptRow = p;
		receiptOpen = true;
	}

	function onDialogSaved(result: { paymentId: string; wantReceipt: boolean }) {
		onChanged();
		if (result.wantReceipt && result.paymentId) pendingReceiptId = result.paymentId;
	}

	// Client-side token fill for the receipt preview (mirrors the server's interpolation).
	const receiptAmount = $derived(receiptRow ? formatCurrency(receiptRow.amount) : '');
	function fillReceipt(template: string, link: string): string {
		return template
			.replaceAll('{contact_name}', contactName)
			.replaceAll('{org_name}', orgName)
			.replaceAll('{invoice_number}', invoiceNumberDisplay)
			.replaceAll('{amount}', receiptAmount)
			.replaceAll('{invoice_link}', link);
	}
	const receiptSms = $derived(
		`Hi {contact_name}, thanks! {org_name} received your {amount} payment for invoice {invoice_number}.`
	);
	const receiptSubject = $derived(`Payment received — invoice {invoice_number}`);
	const receiptBody = $derived(
		`Hi {contact_name},\n\nThank you — we've received your {amount} payment for invoice {invoice_number}.\n\nThanks for your business,\n{org_name}`
	);

	async function sendReceipt(
		channels: ('email' | 'sms')[],
		edited: { sms: string | null; subject: string | null; body: string | null } | null
	): Promise<{ ok: boolean; channelError?: string }> {
		if (!receiptRow) return { ok: false };
		try {
			const res = await fetch(`/api/invoices/${invoiceId}/payments/${receiptRow.id}/receipt`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					channels,
					sms_body: edited?.sms ?? null,
					email_subject: edited?.subject ?? null,
					email_body: edited?.body ?? null
				})
			});
			const b = await res.json().catch(() => ({}));
			if (!res.ok) {
				if (b.field_errors?.channels) return { ok: false, channelError: b.field_errors.channels };
				toast.error(b.error ?? 'Could not send receipt');
				return { ok: false };
			}
			toast.success('Receipt sent');
			onChanged();
			return { ok: true };
		} catch {
			toast.error('Network error');
			return { ok: false };
		}
	}

	const receiptMergeFields = [
		{ token: 'contact_name', label: 'Name' },
		{ token: 'org_name', label: 'Business' },
		{ token: 'invoice_number', label: 'Invoice #' },
		{ token: 'amount', label: 'Amount' }
	];
</script>

<DocumentSectionCard flush title="Payments" count={payments.length}>
	{#snippet actions()}
		{#if canAdd}
			<button type="button" class="btn btn--sm btn--outline" onclick={openAdd}>
				<i class="ri-add-line" aria-hidden="true"></i>
				<span>Add payment</span>
			</button>
		{/if}
	{/snippet}

	{#if payments.length === 0}
		<div class="payments-empty">
			<i class="ri-error-warning-line" aria-hidden="true"></i>
			<span>No payments made</span>
		</div>
	{:else}
		<div class="payments-table-wrap">
			<table class="payments-table">
				<thead>
					<tr>
						<th>Method</th>
						<th class="payments-table__num">Base</th>
						<th class="payments-table__num">Tip</th>
						<th class="payments-table__num">Total</th>
						<th>Date</th>
						<th class="payments-table__actions-h">Actions</th>
					</tr>
				</thead>
				<tbody>
					{#each payments as p (p.id)}
						{@const base = Number(p.amount)}
						{@const tipVal = Number(p.tip_amount)}
						<tr>
							<td>
								<span class="payments-table__method">
									{#if p.adjustment_type === 'payment'}
										{PAYMENT_METHOD_LABELS[p.payment_method]}
									{:else}
										{PAYMENT_ADJUSTMENT_LABELS[p.adjustment_type]}
									{/if}
								</span>
								{#if p.notes}<span class="payments-table__details">{p.notes}</span>{/if}
							</td>
							<td class="payments-table__num" class:payments-table__num--negative={base < 0}
								>{formatCurrency(base)}</td
							>
							<td class="payments-table__num" class:payments-table__num--negative={tipVal < 0}
								>{formatCurrency(tipVal)}</td
							>
							<td
								class="payments-table__num payments-table__total"
								class:payments-table__num--negative={base + tipVal < 0}
								>{formatCurrency(base + tipVal)}</td
							>
							<td>{formatDate(p.paid_at)}</td>
							<td>
								<div class="payments-table__actions">
									{#if p.adjustment_type === 'payment' && Number(p.amount) > 0}
										<button
											type="button"
											class="payments-table__action"
											title={p.receipt_sent_at ? 'Receipt sent — send again' : 'Send receipt'}
											aria-label="Send receipt"
											onclick={() => openReceipt(p)}
										>
											<i
												class={p.receipt_sent_at ? 'ri-mail-check-line' : 'ri-mail-send-line'}
												aria-hidden="true"
											></i>
										</button>
									{/if}
									{#if canEdit(p)}
										<button
											type="button"
											class="payments-table__action"
											title="Edit payment"
											aria-label="Edit payment"
											onclick={() => openEdit(p)}
										>
											<i class="ri-edit-line" aria-hidden="true"></i>
										</button>
										<button
											type="button"
											class="payments-table__action"
											title="Delete payment"
											aria-label="Delete payment"
											onclick={() => deletePayment(p)}
										>
											<i class="ri-delete-bin-line" aria-hidden="true"></i>
										</button>
									{:else if canReverse(p)}
										<button
											type="button"
											class="payments-table__action"
											title={isManual(p) ? 'Reverse payment' : 'Issue refund'}
											aria-label={isManual(p) ? 'Reverse payment' : 'Issue refund'}
											onclick={() => openRefund(p)}
										>
											<i class="ri-refund-2-line" aria-hidden="true"></i>
										</button>
									{/if}
								</div>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</DocumentSectionCard>

<RecordPaymentDialog
	bind:open={dialogOpen}
	{invoiceId}
	{amountDue}
	{tipsEnabled}
	mode={dialogMode}
	payment={dialogRow}
	maxAmount={dialogMaxAmount}
	maxTip={dialogMaxTip}
	onSaved={onDialogSaved}
/>

{#if receiptRow}
	<NotifyDialog
		bind:open={receiptOpen}
		title="Send receipt"
		titleNum={invoiceNumberDisplay}
		subtitle={`${receiptAmount} payment`}
		recipientName={contactName}
		recipientEmail={contactEmail}
		recipientPhone={contactPhone}
		recipientSmsOptOut={contactSmsOptOut}
		mergeFields={receiptMergeFields}
		fill={fillReceipt}
		defaultSms={receiptSms}
		defaultSubject={receiptSubject}
		defaultBody={receiptBody}
		confirmLabel="Send receipt"
		onConfirm={sendReceipt}
	/>
{/if}

<style lang="scss">
	@use '$lib/styles/tokens' as *;

	.payments-empty {
		display: flex;
		align-items: center;
		gap: $space-2;
		font-size: $fs-body;
		color: var(--color-text-muted);

		i {
			font-size: 1.6rem;
			color: var(--warning-text, #b45309);
		}
	}

	.payments-table-wrap {
		overflow-x: auto;
	}

	.payments-table {
		width: 100%;
		border-collapse: collapse;
		font-size: $fs-body;

		th {
			text-align: left;
			padding: $space-2 $space-3;
			font-size: $fs-caption;
			font-weight: $weight-medium;
			color: var(--color-text-muted);
			border-bottom: 1px solid var(--color-border-subtle);
			white-space: nowrap;
		}

		td {
			padding: $space-3;
			color: var(--color-text-primary);
			border-bottom: 1px solid var(--color-border-subtle);
			vertical-align: middle;
		}

		tbody tr:last-child td {
			border-bottom: none;
		}

		&__num {
			text-align: right;
			white-space: nowrap;
			font-variant-numeric: tabular-nums;

			&--negative {
				color: var(--danger-text);
			}
		}

		&__total {
			font-weight: $weight-semibold;
		}

		&__method {
			display: block;
			font-weight: $weight-medium;
		}

		&__details {
			display: block;
			margin-top: 2px;
			font-size: $fs-caption;
			color: var(--color-text-muted);
			max-width: 220px;
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
		}

		&__actions-h {
			text-align: right;
		}

		&__actions {
			display: flex;
			align-items: center;
			justify-content: flex-end;
			gap: $space-1;
		}

		&__action {
			display: inline-flex;
			align-items: center;
			justify-content: center;
			width: 30px;
			height: 30px;
			border: none;
			border-radius: $radius-md;
			background: none;
			color: var(--color-text-muted);
			cursor: pointer;

			i {
				font-size: 1.4rem;
			}

			&:hover {
				background: var(--color-bg-subtle);
				color: var(--color-text-primary);
			}
		}
	}
</style>
