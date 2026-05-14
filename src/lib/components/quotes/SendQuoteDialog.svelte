<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import JetEngineButton from '$lib/components/shared/JetEngineButton.svelte';
	import { toast } from '$lib/stores/toast.svelte';
	import { formatCurrency } from '$lib/utils/format';
	import { Send } from '@lucide/svelte';

	let {
		open = $bindable(false),
		quoteId,
		quoteNumberDisplay,
		title,
		total,
		contactName,
		contactEmail,
		contactPhone,
		mode,
		onSent
	}: {
		open?: boolean;
		quoteId: string;
		quoteNumberDisplay: string;
		title: string;
		total: string;
		contactName: string;
		contactEmail: string | null;
		contactPhone: string;
		mode: 'send' | 'resend';
		onSent?: () => void;
	} = $props();

	let busy = $state(false);

	const verb = $derived(mode === 'send' ? 'sent you a quote' : 'updated your quote');
	const smsPreview = $derived(
		`Hi ${contactName}, [your business] ${verb} (${quoteNumberDisplay}, ${formatCurrency(total)}). View it here: [link]`
	);
	const emailPreview = $derived(
		contactEmail
			? `${mode === 'send' ? 'Your quote' : 'Updated quote'} ${quoteNumberDisplay} — ${formatCurrency(total)}`
			: null
	);

	async function confirm() {
		busy = true;
		try {
			const path = mode === 'send' ? 'send' : 'resend';
			const res = await fetch(`/api/quotes/${quoteId}/${path}`, { method: 'POST' });
			const body = await res.json();
			if (!res.ok) {
				toast.error(body.error ?? 'Failed to send');
				return;
			}
			toast.success(mode === 'send' ? 'Quote sent' : 'Quote resent');
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
			<Dialog.Title>{mode === 'send' ? 'Send quote' : 'Resend quote'}</Dialog.Title>
		</Dialog.Header>
		<div class="space-y-4">
			<div class="rounded-lg bg-muted/50 p-3 text-sm">
				<p class="font-medium">{contactName}</p>
				<p class="text-muted-foreground">{contactPhone}{contactEmail ? ` · ${contactEmail}` : ''}</p>
			</div>

			<div class="space-y-2">
				<p class="text-xs font-medium uppercase tracking-wide text-muted-foreground">SMS preview</p>
				<p class="rounded-lg border border-border bg-card p-3 text-sm">{smsPreview}</p>
			</div>

			{#if emailPreview}
				<div class="space-y-2">
					<p class="text-xs font-medium uppercase tracking-wide text-muted-foreground">Email subject</p>
					<p class="rounded-lg border border-border bg-card p-3 text-sm">{emailPreview}</p>
				</div>
			{:else}
				<p class="text-xs text-muted-foreground">Contact has no email — only SMS will be sent.</p>
			{/if}

			{#if mode === 'resend'}
				<p class="rounded-lg bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-400">
					Resending rotates the public link. Previous links will stop working immediately.
				</p>
			{/if}
		</div>
		<Dialog.Footer>
			<Button variant="outline" onclick={() => (open = false)} disabled={busy}>Cancel</Button>
			<JetEngineButton
				label={mode === 'send' ? 'Send now' : 'Resend now'}
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
