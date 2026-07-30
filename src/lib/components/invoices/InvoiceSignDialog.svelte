<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import SignaturePad from '$lib/components/shared/SignaturePad.svelte';
	import { toast } from '$lib/stores/toast.svelte';

	let {
		open = $bindable(false),
		invoiceId,
		invoiceNumberDisplay,
		contactName,
		onDone
	}: {
		open?: boolean;
		invoiceId: string;
		invoiceNumberDisplay: string;
		contactName: string;
		onDone: () => void;
	} = $props();

	let pad: SignaturePad | undefined = $state();
	let hasDrawn = $state(false);
	let signerName = $state('');
	let errorMsg = $state<string | null>(null);
	let busy = $state(false);

	// Reset every time the dialog opens.
	$effect(() => {
		if (!open) return;
		errorMsg = null;
		busy = false;
		hasDrawn = false;
		signerName = contactName ?? '';
		pad?.clear();
	});

	async function submit() {
		if (busy) return;
		errorMsg = null;
		const name = signerName.trim();
		if (name.length < 2) {
			errorMsg = 'Enter the customer’s full name.';
			return;
		}
		if (!hasDrawn) {
			errorMsg = 'Please sign in the box above.';
			return;
		}
		busy = true;
		try {
			// 1) Upload the drawn signature as an invoice_signature media row.
			const blob = await (pad?.toBlob() ?? Promise.resolve(null));
			if (!blob) throw new Error('Could not read the signature.');
			const fd = new FormData();
			fd.append('file', new File([blob], 'signature.png', { type: 'image/png' }));
			fd.append('purpose_tag', 'invoice_signature');
			fd.append('invoice_id', invoiceId);
			const upRes = await fetch('/api/media/upload', { method: 'POST', body: fd });
			const upBody = await upRes.json().catch(() => ({}));
			if (!upRes.ok) {
				errorMsg = upBody.error ?? 'Could not save the signature.';
				return;
			}
			const signatureMediaId = upBody.data.id as string;

			// 2) Bind the signature to the invoice.
			const res = await fetch(`/api/invoices/${invoiceId}/sign`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ signer_name: name, signature_media_id: signatureMediaId })
			});
			const body = await res.json().catch(() => ({}));
			if (!res.ok) {
				errorMsg = body.error ?? 'Could not record the signature.';
				return;
			}
			toast.success(`${invoiceNumberDisplay} signed`);
			onDone();
			open = false;
		} catch (err) {
			errorMsg = err instanceof Error ? err.message : 'Network error';
		} finally {
			busy = false;
		}
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content showClose={false} class="dialog-content dialog-content--wide">
		<div class="dialog-content__header">
			<div>
				<Dialog.Title class="dialog-content__title">Collect signature</Dialog.Title>
				<Dialog.Description class="dialog-content__description">
					Hand your device to {contactName} to sign {invoiceNumberDisplay} in person.
				</Dialog.Description>
			</div>
			<Dialog.Close class="dialog-content__close" aria-label="Close">
				<i class="ri-close-line" aria-hidden="true"></i>
			</Dialog.Close>
		</div>

		<div class="dialog-content__body invoice-sign__body">
			<div class="invoice-sign__field">
				<label class="invoice-sign__label" for="invoice-signer-name">Full name</label>
				<Input
					id="invoice-signer-name"
					bind:value={signerName}
					maxlength={200}
					placeholder="Customer’s full name"
					autocomplete="off"
					autofocus
				/>
			</div>

			<div class="invoice-sign__field">
				<span class="invoice-sign__label">Signature</span>
				<SignaturePad bind:this={pad} bind:hasDrawn disabled={busy} />
			</div>

			<p class="invoice-sign__ack">
				By signing, {signerName.trim() || 'the customer'} acknowledges this invoice.
			</p>

			{#if errorMsg}
				<p class="invoice-sign__error">{errorMsg}</p>
			{/if}
		</div>

		<div class="dialog-content__footer">
			<Button variant="ghost" onclick={() => (open = false)} disabled={busy}>Cancel</Button>
			<Button loading={busy} loadingLabel="Saving…" onclick={submit}>
				<i class="ri-checkbox-circle-line" aria-hidden="true"></i> Save signature
			</Button>
		</div>
	</Dialog.Content>
</Dialog.Root>

<style lang="scss">
	@use '$lib/styles/tokens' as *;

	.invoice-sign {
		&__body {
			display: flex;
			flex-direction: column;
			gap: $space-4;
		}

		&__field {
			display: flex;
			flex-direction: column;
			gap: $space-2;
		}

		&__label {
			font-size: $fs-caption;
			font-weight: 600;
			color: var(--color-text-muted);
		}

		&__ack {
			margin: 0;
			font-size: $fs-caption;
			color: var(--color-text-muted);
			line-height: 1.5;
		}

		&__error {
			margin: 0;
			font-size: $fs-caption;
			color: var(--color-danger);
		}
	}
</style>
