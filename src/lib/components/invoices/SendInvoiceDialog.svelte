<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import JetEngineButton from '$lib/components/shared/JetEngineButton.svelte';
	import { toast } from '$lib/stores/toast.svelte';
	import { formatCurrency } from '$lib/utils/format';
	import { Send } from '@lucide/svelte';

	let {
		open = $bindable(false),
		invoiceId,
		invoiceNumberDisplay,
		total,
		amountDue,
		contactName,
		contactEmail,
		contactPhone,
		dueDate,
		onSent
	}: {
		open?: boolean;
		invoiceId: string;
		invoiceNumberDisplay: string;
		total: string;
		amountDue: string;
		contactName: string;
		contactEmail: string | null;
		contactPhone: string;
		dueDate: string | null;
		onSent?: () => void;
	} = $props();

	let busy = $state(false);

	const dueLabel = $derived(
		dueDate ? new Date(dueDate).toLocaleDateString('en-US') : null
	);
	const smsPreview = $derived(
		`Hi ${contactName}, your invoice ${invoiceNumberDisplay} for ${formatCurrency(total)} is ready${dueLabel ? ` (due ${dueLabel})` : ''}. Pay or view: [link]`
	);
	const emailPreview = $derived(
		contactEmail ? `Invoice ${invoiceNumberDisplay} — ${formatCurrency(amountDue)} due` : null
	);

	async function confirm() {
		busy = true;
		try {
			const res = await fetch(`/api/invoices/${invoiceId}/send`, { method: 'POST' });
			const body = await res.json();
			if (!res.ok) {
				toast.error(body.error ?? 'Failed to send');
				return;
			}
			toast.success('Invoice sent');
			open = false;
			onSent?.();
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
			<Dialog.Title>Send invoice</Dialog.Title>
		</Dialog.Header>
		<div class="space-y-4">
			<div class="rounded-lg bg-muted/50 p-3 text-sm">
				<p class="font-medium">{contactName}</p>
				<p class="text-muted-foreground">
					{contactPhone}{contactEmail ? ` · ${contactEmail}` : ''}
				</p>
			</div>

			<div class="space-y-2">
				<p class="text-xs font-medium uppercase tracking-wide text-muted-foreground">
					SMS preview
				</p>
				<p class="rounded-lg border border-border bg-card p-3 text-sm">{smsPreview}</p>
			</div>

			{#if emailPreview}
				<div class="space-y-2">
					<p class="text-xs font-medium uppercase tracking-wide text-muted-foreground">
						Email subject
					</p>
					<p class="rounded-lg border border-border bg-card p-3 text-sm">{emailPreview}</p>
				</div>
			{:else}
				<p class="text-xs text-muted-foreground">Contact has no email — only SMS will be sent.</p>
			{/if}
		</div>
		<Dialog.Footer>
			<Button variant="outline" onclick={() => (open = false)} disabled={busy}>Cancel</Button>
			<JetEngineButton
				label="Send now"
				loadingLabel="Sending…"
				successLabel="Sent"
				state={busy ? 'loading' : 'idle'}
				onclick={confirm}
			>
				{#snippet icon()}<Send class="h-4 w-4" />{/snippet}
			</JetEngineButton>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
