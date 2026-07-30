<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog';
	import * as Select from '$lib/components/ui/select';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Textarea } from '$lib/components/ui/textarea';
	import { Switch } from '$lib/components/ui/switch';
	import { Button } from '$lib/components/ui/button';
	import { Calendar } from '$lib/components/ui/calendar';
	import { toast } from '$lib/stores/toast.svelte';
	import { formatCurrency } from '$lib/utils/format';
	import { MANUAL_PAYMENT_METHODS } from '$lib/utils/invoices';
	import type { InvoicePaymentRow, ManualPaymentMethod } from '$lib/types/invoices';

	let {
		open = $bindable(false),
		invoiceId,
		amountDue,
		tipsEnabled = false,
		mode = 'create',
		payment = null,
		maxAmount = null,
		maxTip = null,
		onSaved
	}: {
		open?: boolean;
		invoiceId: string;
		amountDue: string;
		tipsEnabled?: boolean;
		mode?: 'create' | 'edit' | 'refund';
		payment?: InvoicePaymentRow | null;
		maxAmount?: string | null;
		maxTip?: string | null;
		onSaved?: (result: { paymentId: string; wantReceipt: boolean }) => void;
	} = $props();

	const isRefund = $derived(mode === 'refund');
	const isEdit = $derived(mode === 'edit');
	const isOnlinePayment = $derived(
		Boolean(payment && (payment.payment_method === 'stripe' || payment.stripe_payment_intent_id))
	);
	const reversalLabel = $derived(isOnlinePayment ? 'Refund' : 'Reverse');
	const effectiveMax = $derived(Number(maxAmount ?? amountDue));

	function todayStr(): string {
		const d = new Date();
		return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
	}

	let amount = $state('');
	let method = $state<ManualPaymentMethod>('cash');
	let details = $state('');
	let tip = $state('');
	let paidDate = $state('');
	let sendReceipt = $state(false);
	let busy = $state(false);

	$effect(() => {
		if (!open) return;
		amount =
			payment && (isEdit || isRefund)
				? Math.abs(Number(payment.amount)).toFixed(2)
				: Number(amountDue).toFixed(2);
		method =
			payment && isEdit && payment.payment_method !== 'stripe' ? payment.payment_method : 'cash';
		details = payment && isEdit ? (payment.notes ?? '') : '';
		tip =
			payment && isRefund && Number(payment.tip_amount) > 0
				? Number(payment.tip_amount).toFixed(2)
				: '';
		paidDate = payment && isEdit ? payment.paid_at.slice(0, 10) : todayStr();
		sendReceipt = false;
	});

	async function submit() {
		const n = Number(amount);
		if (!Number.isFinite(n) || n <= 0) return toast.error('Enter a positive amount');
		if (n > effectiveMax + 0.001) {
			return toast.error(
				isRefund
					? `Refund can’t exceed ${formatCurrency(effectiveMax)}`
					: `Amount can’t exceed ${formatCurrency(effectiveMax)}`
			);
		}
		const tipText = String(tip ?? '').trim();
		const tipValue = tipText === '' ? 0 : Number(tipText);
		if (!Number.isFinite(tipValue) || tipValue < 0) return toast.error('Enter a valid tip amount');
		if (isRefund && maxTip !== null && tipValue > Number(maxTip) + 0.001) {
			return toast.error(`Tip refund can’t exceed ${formatCurrency(Number(maxTip))}`);
		}

		const payload: Record<string, unknown> = {
			amount: n,
			tip_amount: tipsEnabled || isRefund ? tipValue : 0,
			paid_at: paidDate || todayStr(),
			notes: details.trim() || null
		};
		if (!isRefund) payload.payment_method = method;

		busy = true;
		try {
			const url = payment
				? `/api/invoices/${invoiceId}/payments/${payment.id}`
				: `/api/invoices/${invoiceId}/record-payment`;
			const res = await fetch(url, {
				method: isRefund ? 'POST' : isEdit ? 'PATCH' : 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(payload)
			});
			const body = await res.json().catch(() => ({}));
			if (!res.ok) return toast.error(body.error ?? 'Could not save payment');
			toast.success(
				isRefund ? `${reversalLabel} issued` : isEdit ? 'Payment updated' : 'Payment recorded'
			);
			const paymentId =
				(body.data?.payment_id as string) ?? (body.data?.id as string) ?? payment?.id ?? '';
			open = false;
			onSaved?.({ paymentId, wantReceipt: !isRefund && !isEdit && sendReceipt });
		} catch {
			toast.error('Network error');
		} finally {
			busy = false;
		}
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="record-payment" showClose={false}>
		<div class="dialog-content__header">
			<div class="dialog-content__header-main">
				<Dialog.Title>
					{isRefund ? `${reversalLabel} payment` : isEdit ? 'Edit payment' : 'Add payment'}
				</Dialog.Title>
				<Dialog.Description>
					{#if isRefund}
						{isOnlinePayment ? 'Refundable' : 'Reversible'} base:
						<span class="record-payment__balance">{formatCurrency(effectiveMax)}</span>
					{:else}
						Balance due: <span class="record-payment__balance">{formatCurrency(amountDue)}</span>
					{/if}
				</Dialog.Description>
			</div>
			<Dialog.Close class="dialog-content__close" aria-label="Close"
				><i class="ri-close-line" aria-hidden="true"></i></Dialog.Close
			>
		</div>

		<div class="record-payment__body">
			<div class="record-payment__grid">
				<div class="record-payment__field">
					<Label for="payment-amount">Amount <span class="record-payment__req">*</span></Label>
					<Input
						id="payment-amount"
						type="number"
						inputmode="decimal"
						min="0"
						step="0.01"
						bind:value={amount}
					/>
				</div>
				{#if tipsEnabled || isRefund}
					<div class="record-payment__field">
						<Label for="payment-tip">Tip</Label>
						<Input
							id="payment-tip"
							type="number"
							inputmode="decimal"
							min="0"
							step="0.01"
							placeholder="0.00"
							bind:value={tip}
						/>
					</div>
				{/if}
			</div>

			<div class="record-payment__grid">
				{#if !isRefund}
					<div class="record-payment__field">
						<Label>Payment type <span class="record-payment__req">*</span></Label>
						<Select.Root bind:value={method} items={MANUAL_PAYMENT_METHODS}>
							<Select.Trigger><Select.Value placeholder="Choose type" /></Select.Trigger>
							<Select.Content
								>{#each MANUAL_PAYMENT_METHODS as item (item.value)}<Select.Item
										value={item.value}
										label={item.label}
									/>{/each}</Select.Content
							>
						</Select.Root>
					</div>
				{/if}
				<div class="record-payment__field">
					<Label>{isRefund ? `${reversalLabel} date` : 'Payment date'}</Label>
					<Calendar bind:value={paidDate} placeholder="Pick date" />
				</div>
			</div>

			<div class="record-payment__field">
				<Label for="payment-details">Details</Label>
				<Textarea
					id="payment-details"
					rows={2}
					bind:value={details}
					placeholder={isRefund
						? `Reason for the ${reversalLabel.toLowerCase()}`
						: 'Check #1042, confirmation number, etc.'}
				/>
			</div>

			{#if !isRefund && !isEdit}
				<div class="record-payment__receipt">
					<div>
						<p class="record-payment__receipt-title">Send receipt to customer</p>
						<p class="record-payment__receipt-hint">
							Pick the channel and message on the next step.
						</p>
					</div>
					<Switch bind:checked={sendReceipt} />
				</div>
			{/if}
		</div>

		<div class="dialog-content__footer">
			<Button variant="ghost" onclick={() => (open = false)} disabled={busy}>Cancel</Button>
			<Button
				loadingLabel={isRefund ? `${reversalLabel}ing…` : isEdit ? 'Saving…' : 'Recording…'}
				loading={busy}
				onclick={submit}
			>
				{#snippet icon()}<i class={isRefund ? 'ri-refund-2-line' : 'ri-add-line'} aria-hidden="true"
					></i>{/snippet}
				{isRefund ? `${reversalLabel} payment` : isEdit ? 'Save changes' : 'Add payment'}
			</Button>
		</div>
	</Dialog.Content>
</Dialog.Root>

<style lang="scss">
	@use '$lib/styles/tokens' as *;
	.record-payment__body {
		display: flex;
		flex-direction: column;
		gap: $space-4;
		padding: $space-4 $space-5;
	}
	.record-payment__grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: $space-3;
	}
	.record-payment__field {
		display: flex;
		flex-direction: column;
		gap: $space-1;
		min-width: 0;
	}
	.record-payment__req {
		color: var(--danger-text);
	}
	.record-payment__balance {
		font-weight: $weight-semibold;
		color: var(--color-text-primary);
	}
	.record-payment__field :global(.ui-select__trigger) {
		width: 100%;
	}
	.record-payment__receipt {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: $space-3;
		padding: $space-3 $space-4;
		border: 1px solid var(--color-border);
		border-radius: $radius-lg;
		background: var(--color-bg-subtle);
	}
	.record-payment__receipt-title {
		font-size: $fs-body;
		font-weight: $weight-medium;
		color: var(--color-text-primary);
	}
	.record-payment__receipt-hint {
		margin-top: 2px;
		font-size: $fs-caption;
		color: var(--color-text-muted);
	}
</style>
