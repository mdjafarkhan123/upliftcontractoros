<script lang="ts">
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

	let verifiedLabel = $derived(lastVerifiedAt ? relativeFrom(new Date(lastVerifiedAt)) : null);

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

<section class="stripe-card">
	{#if isConnected}
		<!-- Hero: connected state -->
		<div class="stripe-card__hero">
			<div class="stripe-card__hero-top">
				<div class="stripe-card__hero-id">
					<div class="stripe-card__hero-icon">
						<i class="ri-shield-check-line" aria-hidden="true"></i>
					</div>
					<div>
						<p class="stripe-card__eyebrow">Online payments</p>
						<h3 class="stripe-card__hero-name">{accountName ?? 'Your Stripe account'}</h3>
						{#if accountEmail}
							<p class="stripe-card__hero-email">{accountEmail}</p>
						{/if}
					</div>
				</div>
				<div class="stripe-card__hero-badges">
					<span class="stripe-card__badge">
						<i class="ri-checkbox-circle-line" aria-hidden="true"></i> Connected
					</span>
					{#if livemode === true}
						<span class="stripe-card__badge stripe-card__badge--mode">
							<i class="ri-global-line" aria-hidden="true"></i> Live mode
						</span>
					{:else if livemode === false}
						<span class="stripe-card__badge stripe-card__badge--mode stripe-card__badge--test">
							<i class="ri-flask-line" aria-hidden="true"></i> Test mode
						</span>
					{/if}
				</div>
			</div>
			<p class="stripe-card__hero-note">
				Payments go directly to your Stripe balance and on to your bank. You stay in full control —
				disconnect or rotate your keys anytime.
			</p>
		</div>

		<!-- Body: details + verify -->
		<div class="stripe-card__body">
			<div class="stripe-card__meta-row">
				<div class="stripe-card__meta">
					{#if connectedLabel}Connected {connectedLabel}{/if}
					{#if verifiedLabel}
						· Last checked {verifiedLabel}{/if}
				</div>
				<button
					type="button"
					class="stripe-card__test-btn"
					onclick={testConnection}
					disabled={testing}
				>
					<i class={testing ? 'ri-loader-4-line' : 'ri-refresh-line'} aria-hidden="true"></i>
					{testing ? 'Checking…' : 'Test connection'}
				</button>
			</div>

			<dl class="stripe-card__dl">
				<div>
					<dt class="stripe-card__dt">Restricted key</dt>
					<dd class="stripe-card__dd">{restrictedKeyMasked ?? '—'}</dd>
				</div>
				<div>
					<dt class="stripe-card__dt">Publishable key</dt>
					<dd class="stripe-card__dd">{publishableKey ?? '—'}</dd>
				</div>
				<div>
					<dt class="stripe-card__dt">Webhook secret</dt>
					<dd class="stripe-card__dd">{webhookSecretMasked ?? '—'}</dd>
				</div>
				<div>
					<dt class="stripe-card__dt">Stripe account ID</dt>
					<dd class="stripe-card__dd">{accountId ?? '—'}</dd>
				</div>
			</dl>

			<div class="stripe-card__webhook">
				<p class="stripe-card__webhook-title">Stripe webhook endpoint</p>
				<p class="stripe-card__webhook-desc">
					This is the address Stripe uses to tell us when a customer pays. It's already set up in
					your Stripe dashboard from your initial setup — no action needed now.
				</p>
				<div class="stripe-card__webhook-row">
					<code class="stripe-card__code">{webhookUrl}</code>
					<button type="button" class="stripe-codebtn" onclick={copyWebhook}>
						<i class="ri-file-copy-line" aria-hidden="true"></i> Copy
					</button>
					<a
						class="stripe-codebtn"
						href="https://dashboard.stripe.com/webhooks"
						target="_blank"
						rel="noopener noreferrer"
					>
						<i class="ri-external-link-line" aria-hidden="true"></i> Open Stripe
					</a>
				</div>
			</div>
		</div>
	{:else}
		<!-- Not connected state -->
		<div class="stripe-card__prompt">
			<div class="stripe-card__prompt-top">
				<div class="stripe-card__prompt-id">
					<div class="stripe-card__prompt-icon">
						<i class="ri-error-warning-line" aria-hidden="true"></i>
					</div>
					<div>
						<h3 class="stripe-card__prompt-title">Online payments not active yet</h3>
						<p class="stripe-card__prompt-desc">
							Connect Stripe below to start collecting card payments on your invoices.
						</p>
					</div>
				</div>
				<span class="stripe-card__pill-warn">
					<i class="ri-error-warning-line" aria-hidden="true"></i> Not connected
				</span>
			</div>
			<p class="stripe-card__reassure">
				<strong>Your money stays yours.</strong>
				Payments go directly into your own Stripe balance and then to your bank. We never hold your funds
				— we only help you collect them.
			</p>
		</div>
	{/if}
</section>
