<script lang="ts">
	import { CheckCircle2, AlertCircle, ExternalLink, Copy, ShieldCheck, RefreshCw, Beaker, Globe2 } from '@lucide/svelte';
	import { toast } from '$lib/stores/toast.svelte';

	let {
		isConnected,
		restrictedKeyMasked,
		publishableKey,
		webhookSecretMasked,
		accountId,
		accountName,
		accountEmail,
		livemode,
		connectedAt,
		lastVerifiedAt,
		webhookUrl,
		onVerified
	}: {
		isConnected: boolean;
		restrictedKeyMasked: string | null;
		publishableKey: string | null;
		webhookSecretMasked: string | null;
		accountId: string | null;
		accountName: string | null;
		accountEmail: string | null;
		livemode: boolean | null;
		connectedAt: string | null;
		lastVerifiedAt: string | null;
		webhookUrl: string;
		onVerified?: (next: {
			livemode: boolean;
			stripe_account_id: string | null;
			stripe_account_name: string | null;
			stripe_account_email: string | null;
			stripe_last_verified_at: string;
		}) => void;
	} = $props();

	let testing = $state(false);

	let connectedLabel = $derived(
		connectedAt
			? new Date(connectedAt).toLocaleDateString(undefined, {
					month: 'short',
					day: 'numeric',
					year: 'numeric'
				})
			: null
	);

	let verifiedLabel = $derived(
		lastVerifiedAt ? relativeFrom(new Date(lastVerifiedAt)) : null
	);

	function relativeFrom(date: Date) {
		const diffMs = Date.now() - date.getTime();
		const mins = Math.round(diffMs / 60000);
		if (mins < 1) return 'just now';
		if (mins < 60) return `${mins} min ago`;
		const hours = Math.round(mins / 60);
		if (hours < 24) return `${hours}h ago`;
		const days = Math.round(hours / 24);
		return `${days}d ago`;
	}

	async function copyWebhook() {
		try {
			await navigator.clipboard.writeText(webhookUrl);
			toast.success('Webhook URL copied');
		} catch {
			toast.error('Copy failed');
		}
	}

	async function testConnection() {
		testing = true;
		try {
			const res = await fetch('/api/settings/stripe/test', { method: 'POST' });
			const body = (await res.json()) as {
				data?: {
					ok: boolean;
					livemode: boolean;
					stripe_account_id: string | null;
					stripe_account_name: string | null;
					stripe_account_email: string | null;
					stripe_last_verified_at: string;
				};
				error?: string;
			};
			if (!res.ok || !body.data?.ok) {
				toast.error(body.error ?? 'Connection check failed');
				return;
			}
			toast.success(
				body.data.livemode
					? 'Connection healthy — accepting live payments'
					: 'Connection healthy — test mode'
			);
			onVerified?.(body.data);
		} catch {
			toast.error('Connection check failed');
		} finally {
			testing = false;
		}
	}
</script>

<section class="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
	{#if isConnected}
		<!-- Hero: connected state -->
		<div class="relative bg-gradient-to-br from-emerald-600 via-emerald-700 to-emerald-800 px-5 py-6 text-white">
			<div class="flex flex-wrap items-start justify-between gap-3">
				<div class="flex items-center gap-3">
					<div class="flex h-10 w-10 items-center justify-center rounded-full bg-white/15 backdrop-blur">
						<ShieldCheck class="h-5 w-5" />
					</div>
					<div>
						<p class="text-xs font-medium uppercase tracking-wide text-white/70">Online payments</p>
						<h3 class="text-lg font-semibold">{accountName ?? 'Your Stripe account'}</h3>
						{#if accountEmail}
							<p class="text-xs text-white/80">{accountEmail}</p>
						{/if}
					</div>
				</div>
				<div class="flex flex-col items-end gap-1.5">
					<span class="inline-flex items-center gap-1 rounded-full bg-white/20 px-2.5 py-1 text-xs font-medium backdrop-blur">
						<CheckCircle2 class="h-3.5 w-3.5" /> Connected
					</span>
					{#if livemode === true}
						<span class="inline-flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide">
							<Globe2 class="h-3 w-3" /> Live mode
						</span>
					{:else if livemode === false}
						<span class="inline-flex items-center gap-1 rounded-full bg-amber-400/30 px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide text-amber-50">
							<Beaker class="h-3 w-3" /> Test mode
						</span>
					{/if}
				</div>
			</div>
			<p class="mt-4 max-w-xl text-xs text-white/80">
				Payments go directly to your Stripe balance and on to your bank. You stay in full control — disconnect or rotate your keys anytime.
			</p>
		</div>

		<!-- Body: details + verify -->
		<div class="flex flex-col gap-4 px-5 py-4">
			<div class="flex flex-wrap items-center justify-between gap-3">
				<div class="text-xs text-muted-foreground">
					{#if connectedLabel}Connected {connectedLabel}{/if}
					{#if verifiedLabel}<span class="mx-2">·</span>Last checked {verifiedLabel}{/if}
				</div>
				<button
					type="button"
					onclick={testConnection}
					disabled={testing}
					class="inline-flex h-8 items-center gap-1.5 rounded-full border border-border bg-background px-3 text-xs font-medium hover:bg-accent disabled:opacity-50"
				>
					<RefreshCw class={`h-3.5 w-3.5 ${testing ? 'animate-spin' : ''}`} />
					{testing ? 'Checking…' : 'Test connection'}
				</button>
			</div>

			<dl class="grid grid-cols-1 gap-3 rounded-xl bg-muted/40 p-3 text-sm md:grid-cols-2">
				<div>
					<dt class="text-[11px] uppercase tracking-wide text-muted-foreground">Restricted key</dt>
					<dd class="font-mono text-foreground">{restrictedKeyMasked ?? '—'}</dd>
				</div>
				<div>
					<dt class="text-[11px] uppercase tracking-wide text-muted-foreground">Publishable key</dt>
					<dd class="font-mono text-foreground break-all">{publishableKey ?? '—'}</dd>
				</div>
				<div>
					<dt class="text-[11px] uppercase tracking-wide text-muted-foreground">Webhook secret</dt>
					<dd class="font-mono text-foreground">{webhookSecretMasked ?? '—'}</dd>
				</div>
				<div>
					<dt class="text-[11px] uppercase tracking-wide text-muted-foreground">Stripe account ID</dt>
					<dd class="font-mono text-foreground">{accountId ?? '—'}</dd>
				</div>
			</dl>

			<div class="rounded-xl border border-border bg-background p-3">
				<p class="text-xs font-semibold text-foreground">Stripe webhook endpoint</p>
				<p class="mt-1 text-[11px] text-muted-foreground">
					This is the address Stripe uses to tell us when a customer pays. It’s already set up in your Stripe dashboard from your initial setup — no action needed now.
				</p>
				<div class="mt-2 flex items-center gap-2">
					<code class="flex-1 truncate rounded bg-muted/60 px-2 py-1.5 font-mono text-xs text-foreground">{webhookUrl}</code>
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
						<ExternalLink class="h-3 w-3" /> Open Stripe
					</a>
				</div>
			</div>
		</div>
	{:else}
		<!-- Not connected state -->
		<div class="flex flex-col gap-3 px-5 py-6">
			<div class="flex flex-wrap items-start justify-between gap-3">
				<div class="flex items-center gap-3">
					<div class="flex h-10 w-10 items-center justify-center rounded-full bg-amber-500/10 text-amber-600">
						<AlertCircle class="h-5 w-5" />
					</div>
					<div>
						<h3 class="text-base font-semibold text-foreground">Online payments not active yet</h3>
						<p class="text-sm text-muted-foreground">
							Connect Stripe below to start collecting card payments on your invoices.
						</p>
					</div>
				</div>
				<span class="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-600">
					<AlertCircle class="h-3.5 w-3.5" /> Not connected
				</span>
			</div>
			<p class="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">
				<span class="font-semibold text-foreground">Your money stays yours.</span>
				Payments go directly into your own Stripe balance and then to your bank. We never hold your funds — we only help you collect them.
			</p>
		</div>
	{/if}
</section>
