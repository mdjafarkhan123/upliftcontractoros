<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog';
	import { Input } from '$lib/components/ui/input';
	import { Button } from '$lib/components/ui/button';
	import { toast } from '$lib/stores/toast.svelte';

	let {
		open = $bindable(false),
		invoiceId,
		existingUrl
	}: {
		open?: boolean;
		invoiceId: string;
		existingUrl: string | null;
	} = $props();

	let url = $state<string | null>(null);
	let busy = $state(false);

	$effect(() => {
		if (open) {
			url = existingUrl;
		}
	});

	async function generate() {
		busy = true;
		try {
			const res = await fetch(`/api/invoices/${invoiceId}/create-checkout-session`, {
				method: 'POST'
			});
			const body = await res.json();
			if (!res.ok) {
				toast.error(body.error ?? 'Failed to generate link');
				return;
			}
			url = body.data.url;
			toast.success('Payment link ready');
		} catch {
			toast.error('Network error');
		} finally {
			busy = false;
		}
	}

	async function copy() {
		if (!url) return;
		try {
			await navigator.clipboard.writeText(url);
			toast.success('Link copied');
		} catch {
			toast.error('Could not copy');
		}
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="payment-link" showClose={false}>
		<div class="dialog-content__header">
			<div class="dialog-content__header-main">
				<Dialog.Title>Payment link</Dialog.Title>
				<Dialog.Description>
					Share this Stripe Checkout link with your customer. Payment goes directly to your Stripe
					account.
				</Dialog.Description>
			</div>
			<Dialog.Close class="dialog-content__close" aria-label="Close">
				<i class="ri-close-line" aria-hidden="true"></i>
			</Dialog.Close>
		</div>

		<div class="payment-link__body">
			{#if url}
				<div class="payment-link__row">
					<Input value={url} readonly class="payment-link__url" />
					<button type="button" class="payment-link__copy" onclick={copy} aria-label="Copy link">
						<i class="ri-file-copy-line" aria-hidden="true"></i>
					</button>
				</div>
				<a href={url} target="_blank" rel="noopener" class="payment-link__open">
					<i class="ri-external-link-line" aria-hidden="true"></i>Open checkout
				</a>
				<Button
					loadingLabel="Generating…"
					successLabel="Generated"
					loading={busy}
					onclick={generate}
				>
					Regenerate link
					{#snippet icon()}<i class="ri-link" aria-hidden="true"></i>{/snippet}
				</Button>
			{:else}
				<p class="payment-link__empty">No payment link yet.</p>
				<Button
					loadingLabel="Generating…"
					successLabel="Generated"
					loading={busy}
					onclick={generate}
				>
					Generate payment link
					{#snippet icon()}<i class="ri-link" aria-hidden="true"></i>{/snippet}
				</Button>
			{/if}
		</div>

		<div class="dialog-content__footer">
			<Button variant="ghost" onclick={() => (open = false)}>Close</Button>
		</div>
	</Dialog.Content>
</Dialog.Root>
