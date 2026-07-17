<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Textarea } from '$lib/components/ui/textarea';
	import { Button } from '$lib/components/ui/button';
	import { toast } from '$lib/stores/toast.svelte';
	import { formatCurrency } from '$lib/utils/format';
	import type { PaymentMethod } from '$lib/types/invoices';

	let {
		open = $bindable(false),
		invoiceId,
		amountDue,
		tipsEnabled = false,
		onRecorded
	}: {
		open?: boolean;
		invoiceId: string;
		amountDue: string;
		// M7: when the org has tips enabled, show an optional tip field so a cash/check payment
		// can carry a logged gratuity. Default off so nothing changes for orgs without tips.
		tipsEnabled?: boolean;
		onRecorded?: () => void;
	} = $props();

	let amount = $state('');
	let method = $state<PaymentMethod>('cash');
	let notes = $state('');
	let tip = $state('');
	let busy = $state(false);

	const methods: { value: PaymentMethod; label: string }[] = [
		{ value: 'cash', label: 'Cash' },
		{ value: 'check', label: 'Check' },
		{ value: 'bank_transfer', label: 'Bank transfer' },
		{ value: 'other', label: 'Other' }
	];

	$effect(() => {
		if (open) {
			amount = amountDue;
			method = 'cash';
			notes = '';
			tip = '';
		}
	});

	async function submit() {
		const n = Number(amount);
		if (!Number.isFinite(n) || n <= 0) {
			toast.error('Enter a positive amount');
			return;
		}
		if (n > Number(amountDue) + 0.001) {
			toast.error('Amount exceeds balance due');
			return;
		}

		// Tip is optional and separate from the balance — validate only if one was entered.
		let tipValue = 0;
		if (tipsEnabled && tip.trim() !== '') {
			const t = Number(tip);
			if (!Number.isFinite(t) || t < 0) {
				toast.error('Enter a valid tip amount');
				return;
			}
			tipValue = t;
		}

		busy = true;
		try {
			const res = await fetch(`/api/invoices/${invoiceId}/record-payment`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					amount: n,
					payment_method: method,
					notes: notes.trim() || null,
					...(tipsEnabled && tipValue > 0 ? { tip_amount: tipValue } : {})
				})
			});
			const body = await res.json();
			if (!res.ok) {
				toast.error(body.error ?? 'Failed to record payment');
				return;
			}
			toast.success('Payment recorded');
			open = false;
			onRecorded?.();
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
				<Dialog.Title>Record payment</Dialog.Title>
				<Dialog.Description>
					Balance due: <span class="record-payment__balance">{formatCurrency(amountDue)}</span>
				</Dialog.Description>
			</div>
			<Dialog.Close class="dialog-content__close" aria-label="Close">
				<i class="ri-close-line" aria-hidden="true"></i>
			</Dialog.Close>
		</div>

		<div class="record-payment__body">
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
			<div class="record-payment__field">
				<Label>Method <span class="record-payment__req">*</span></Label>
				<div class="record-payment__methods">
					{#each methods as m (m.value)}
						<button
							type="button"
							onclick={() => (method = m.value)}
							class="record-payment__method"
							class:record-payment__method--active={method === m.value}
						>
							{m.label}
						</button>
					{/each}
				</div>
			</div>
			{#if tipsEnabled}
				<div class="record-payment__field">
					<Label for="payment-tip">Tip (optional)</Label>
					<Input
						id="payment-tip"
						type="number"
						inputmode="decimal"
						min="0"
						step="0.01"
						placeholder="0.00"
						bind:value={tip}
					/>
					<p class="record-payment__hint">
						Added on top of the payment — doesn't reduce the balance.
					</p>
				</div>
			{/if}
			<div class="record-payment__field">
				<Label for="payment-notes">Notes</Label>
				<Textarea id="payment-notes" rows={3} bind:value={notes} placeholder="Check # 1042, etc." />
			</div>
		</div>

		<div class="dialog-content__footer">
			<Button variant="ghost" onclick={() => (open = false)} disabled={busy}>Cancel</Button>
			<Button loadingLabel="Recording…" successLabel="Recorded" loading={busy} onclick={submit}>
				Record payment
			</Button>
		</div>
	</Dialog.Content>
</Dialog.Root>
