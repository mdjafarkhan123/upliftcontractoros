<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Textarea } from '$lib/components/ui/textarea';
	import JetEngineButton from '$lib/components/shared/JetEngineButton.svelte';
	import { toast } from '$lib/stores/toast.svelte';
	import { formatCurrency } from '$lib/utils/format';
	import type { PaymentMethod } from '$lib/types/invoices';

	let {
		open = $bindable(false),
		invoiceId,
		amountDue,
		onRecorded
	}: {
		open?: boolean;
		invoiceId: string;
		amountDue: string;
		onRecorded?: () => void;
	} = $props();

	let amount = $state('');
	let method = $state<PaymentMethod>('cash');
	let notes = $state('');
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

		busy = true;
		try {
			const res = await fetch(`/api/invoices/${invoiceId}/record-payment`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					amount: n,
					payment_method: method,
					notes: notes.trim() || null
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
	<Dialog.Content class="max-w-md">
		<Dialog.Header>
			<Dialog.Title>Record payment</Dialog.Title>
			<Dialog.Description>
				Balance due: <span class="font-medium text-foreground">{formatCurrency(amountDue)}</span>
			</Dialog.Description>
		</Dialog.Header>
		<div class="space-y-4">
			<div class="grid gap-2">
				<Label for="payment-amount">Amount <span class="text-destructive">*</span></Label>
				<Input
					id="payment-amount"
					type="number"
					inputmode="decimal"
					min="0"
					step="0.01"
					bind:value={amount}
				/>
			</div>
			<div class="grid gap-2">
				<Label>Method <span class="text-destructive">*</span></Label>
				<div class="grid grid-cols-2 gap-2">
					{#each methods as m (m.value)}
						<button
							type="button"
							onclick={() => (method = m.value)}
							class={method === m.value
								? 'min-h-[44px] rounded-lg bg-foreground px-3 text-sm font-medium text-background'
								: 'min-h-[44px] rounded-lg border border-border bg-card px-3 text-sm text-muted-foreground hover:bg-accent'}
						>
							{m.label}
						</button>
					{/each}
				</div>
			</div>
			<div class="grid gap-2">
				<Label for="payment-notes">Notes</Label>
				<Textarea id="payment-notes" rows={3} bind:value={notes} placeholder="Check # 1042, etc." />
			</div>
		</div>
		<Dialog.Footer>
			<Button variant="outline" onclick={() => (open = false)} disabled={busy}>Cancel</Button>
			<JetEngineButton
				label="Record payment"
				loadingLabel="Recording…"
				successLabel="Recorded"
				state={busy ? 'loading' : 'idle'}
				onclick={submit}
			/>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
