<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import JetEngineButton from '$lib/components/shared/JetEngineButton.svelte';
	import { toast } from '$lib/stores/toast.svelte';
	import { Copy, ExternalLink, Link as LinkIcon } from '@lucide/svelte';

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
	<Dialog.Content class="max-w-md">
		<Dialog.Header>
			<Dialog.Title>Payment link</Dialog.Title>
			<Dialog.Description>
				Share this Stripe Checkout link with your customer. Payment goes directly to your Stripe
				account.
			</Dialog.Description>
		</Dialog.Header>
		<div class="space-y-4">
			{#if url}
				<div class="flex items-center gap-2">
					<Input value={url} readonly class="text-xs" />
					<Button variant="outline" size="icon" onclick={copy} aria-label="Copy link">
						<Copy class="h-4 w-4" />
					</Button>
				</div>
				<a
					href={url}
					target="_blank"
					rel="noopener"
					class="inline-flex items-center gap-1 text-xs text-primary hover:underline"
				>
					<ExternalLink class="h-3 w-3" />Open checkout
				</a>
				<JetEngineButton
					label="Regenerate link"
					loadingLabel="Generating…"
					successLabel="Generated"
					state={busy ? 'loading' : 'idle'}
					onclick={generate}
				>
					{#snippet icon()}<LinkIcon class="h-4 w-4" />{/snippet}
				</JetEngineButton>
			{:else}
				<p class="text-sm text-muted-foreground">No payment link yet.</p>
				<JetEngineButton
					label="Generate payment link"
					loadingLabel="Generating…"
					successLabel="Generated"
					state={busy ? 'loading' : 'idle'}
					onclick={generate}
				>
					{#snippet icon()}<LinkIcon class="h-4 w-4" />{/snippet}
				</JetEngineButton>
			{/if}
		</div>
		<Dialog.Footer>
			<Button variant="outline" onclick={() => (open = false)}>Close</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
