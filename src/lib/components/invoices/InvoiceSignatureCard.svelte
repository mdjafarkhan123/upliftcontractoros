<script lang="ts">
	import DocumentSectionCard from '$lib/components/documents/DocumentSectionCard.svelte';
	import InvoiceSignDialog from '$lib/components/invoices/InvoiceSignDialog.svelte';
	import ConfirmDialog from '$lib/components/shared/ConfirmDialog.svelte';
	import { toast } from '$lib/stores/toast.svelte';
	import { formatDate } from '$lib/utils/format';

	let {
		invoiceId,
		invoiceNumberDisplay,
		contactName,
		signerName = null,
		signedAt = null,
		signatureMediaId = null,
		canEdit = false,
		onChanged
	}: {
		invoiceId: string;
		invoiceNumberDisplay: string;
		contactName: string;
		signerName?: string | null;
		signedAt?: string | null;
		signatureMediaId?: string | null;
		canEdit?: boolean;
		onChanged: () => void;
	} = $props();

	const isSigned = $derived(!!signatureMediaId);

	// Resolve a short-lived signed URL for the drawn signature image whenever one is on file.
	let signatureUrl = $state<string | null>(null);
	$effect(() => {
		const id = signatureMediaId;
		if (!id) {
			signatureUrl = null;
			return;
		}
		let cancelled = false;
		void fetch(`/api/media/${id}/url?variant=web`)
			.then((r) => (r.ok ? r.json() : null))
			.then((b) => {
				if (!cancelled) signatureUrl = b?.data?.url ?? null;
			})
			.catch(() => {
				if (!cancelled) signatureUrl = null;
			});
		return () => {
			cancelled = true;
		};
	});

	let signOpen = $state(false);
	let clearOpen = $state(false);
	let clearing = $state(false);

	async function confirmClear() {
		clearing = true;
		try {
			const res = await fetch(`/api/invoices/${invoiceId}/sign`, { method: 'DELETE' });
			if (!res.ok) {
				const b = await res.json().catch(() => ({}));
				toast.error(b.error ?? 'Could not clear the signature');
				return;
			}
			toast.success('Signature cleared');
			clearOpen = false;
			onChanged();
		} catch {
			toast.error('Network error');
		} finally {
			clearing = false;
		}
	}
</script>

<DocumentSectionCard title="Signature">
	{#snippet actions()}
		{#if canEdit && !isSigned}
			<button type="button" class="btn btn--sm btn--outline" onclick={() => (signOpen = true)}>
				<i class="ri-quill-pen-line" aria-hidden="true"></i>
				<span>Collect signature</span>
			</button>
		{:else if canEdit && isSigned}
			<button type="button" class="btn btn--sm btn--ghost" onclick={() => (clearOpen = true)}>
				<i class="ri-eraser-line" aria-hidden="true"></i>
				<span>Clear &amp; redo</span>
			</button>
		{/if}
	{/snippet}

	{#if isSigned}
		<div class="invoice-sig">
			{#if signatureUrl}
				<img class="invoice-sig__img" src={signatureUrl} alt="Customer signature" />
			{:else}
				<div class="invoice-sig__img invoice-sig__img--loading">
					<i class="ri-loader-4-line" aria-hidden="true" style="animation: spin 1s linear infinite;"
					></i>
				</div>
			{/if}
			<p class="invoice-sig__meta">
				Signed by <strong>{signerName}</strong>
				{#if signedAt}· {formatDate(signedAt)}{/if}
			</p>
		</div>
	{:else}
		<div class="invoice-sig__empty">
			<i class="ri-quill-pen-line" aria-hidden="true"></i>
			<span>No signature collected</span>
		</div>
	{/if}
</DocumentSectionCard>

<InvoiceSignDialog
	bind:open={signOpen}
	{invoiceId}
	{invoiceNumberDisplay}
	{contactName}
	onDone={onChanged}
/>

<ConfirmDialog
	bind:open={clearOpen}
	title="Clear this signature?"
	description="This removes the captured signature so you can collect a new one. This can’t be undone."
	confirmLabel="Clear signature"
	cancelLabel="Keep signature"
	variant="destructive"
	loading={clearing}
	onConfirm={confirmClear}
/>

<style lang="scss">
	@use '$lib/styles/tokens' as *;

	.invoice-sig {
		display: flex;
		flex-direction: column;
		gap: $space-3;

		&__img {
			align-self: flex-start;
			max-width: 320px;
			width: 100%;
			height: 160px;
			object-fit: contain;
			border: 1px solid var(--color-border-subtle);
			border-radius: $radius-md;
			background: #fff;

			&--loading {
				display: flex;
				align-items: center;
				justify-content: center;
				color: var(--color-text-muted);

				i {
					font-size: 1.8rem;
				}
			}
		}

		&__meta {
			margin: 0;
			font-size: $fs-body;
			color: var(--color-text-muted);

			strong {
				color: var(--color-text-primary);
				font-weight: $weight-semibold;
			}
		}

		&__empty {
			display: flex;
			align-items: center;
			gap: $space-2;
			font-size: $fs-body;
			color: var(--color-text-muted);

			i {
				font-size: 1.6rem;
			}
		}
	}
</style>
