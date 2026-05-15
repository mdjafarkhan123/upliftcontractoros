<script lang="ts">
	import { CheckCircle2, AlertCircle, ExternalLink, Copy } from '@lucide/svelte';
	import { toast } from '$lib/stores/toast.svelte';

	let {
		isConnected,
		restrictedKeyMasked,
		publishableKey,
		webhookSecretMasked,
		accountId,
		connectedAt,
		webhookUrl
	}: {
		isConnected: boolean;
		restrictedKeyMasked: string | null;
		publishableKey: string | null;
		webhookSecretMasked: string | null;
		accountId: string | null;
		connectedAt: string | null;
		webhookUrl: string;
	} = $props();

	let connectedLabel = $derived(
		connectedAt
			? new Date(connectedAt).toLocaleDateString(undefined, {
					month: 'short',
					day: 'numeric',
					year: 'numeric'
				})
			: null
	);

	async function copyWebhook() {
		try {
			await navigator.clipboard.writeText(webhookUrl);
			toast.success('Webhook URL copied');
		} catch {
			toast.error('Copy failed');
		}
	}
</script>

<section class="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 md:p-5">
	<header class="flex items-center justify-between gap-3">
		<div>
			<h3 class="text-base font-semibold text-foreground">Connection status</h3>
			<p class="text-xs text-muted-foreground">Used to accept invoice payments by card.</p>
		</div>
		{#if isConnected}
			<span class="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-1 text-xs font-medium text-emerald-600">
				<CheckCircle2 class="h-3.5 w-3.5" /> Connected
			</span>
		{:else}
			<span class="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-1 text-xs font-medium text-amber-600">
				<AlertCircle class="h-3.5 w-3.5" /> Not connected
			</span>
		{/if}
	</header>

	{#if isConnected}
		<dl class="grid grid-cols-1 gap-2 text-sm md:grid-cols-2">
			<div>
				<dt class="text-xs text-muted-foreground">Restricted key</dt>
				<dd class="font-mono text-foreground">{restrictedKeyMasked ?? '—'}</dd>
			</div>
			<div>
				<dt class="text-xs text-muted-foreground">Publishable key</dt>
				<dd class="font-mono text-foreground break-all">{publishableKey ?? '—'}</dd>
			</div>
			<div>
				<dt class="text-xs text-muted-foreground">Webhook secret</dt>
				<dd class="font-mono text-foreground">{webhookSecretMasked ?? '—'}</dd>
			</div>
			<div>
				<dt class="text-xs text-muted-foreground">Account</dt>
				<dd class="font-mono text-foreground">{accountId ?? '—'}</dd>
			</div>
			{#if connectedLabel}
				<div>
					<dt class="text-xs text-muted-foreground">Connected</dt>
					<dd class="text-foreground">{connectedLabel}</dd>
				</div>
			{/if}
		</dl>
	{/if}

	<div class="rounded-lg border border-border bg-muted/30 p-3">
		<p class="text-xs font-semibold text-foreground">Stripe webhook endpoint</p>
		<p class="mt-1 text-[11px] text-muted-foreground">
			Add this URL to your Stripe webhook settings. Listen for
			<code class="font-mono">checkout.session.completed</code>.
		</p>
		<div class="mt-2 flex items-center gap-2">
			<code class="flex-1 truncate rounded bg-background px-2 py-1.5 font-mono text-xs text-foreground">{webhookUrl}</code>
			<button
				type="button"
				onclick={copyWebhook}
				class="inline-flex h-8 items-center gap-1 rounded-md border border-border bg-background px-2 text-xs font-medium hover:bg-accent"
			>
				<Copy class="h-3 w-3" /> Copy
			</button>
			<a
				href="https://dashboard.stripe.com/webhooks"
				target="_blank"
				rel="noopener noreferrer"
				class="inline-flex h-8 items-center gap-1 rounded-md border border-border bg-background px-2 text-xs font-medium hover:bg-accent"
			>
				<ExternalLink class="h-3 w-3" /> Stripe
			</a>
		</div>
	</div>
</section>
