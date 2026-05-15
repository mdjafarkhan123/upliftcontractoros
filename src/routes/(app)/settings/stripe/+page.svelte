<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import PageWrapper from '$lib/components/shared/PageWrapper.svelte';
	import SkeletonLoader from '$lib/components/shared/SkeletonLoader.svelte';
	import StripeConnectionCard from '$lib/components/settings/StripeConnectionCard.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { toast } from '$lib/stores/toast.svelte';
	import { getMemberContext } from '$lib/context/member';
	import { getOrgContext } from '$lib/context/org';

	type StripeStatus = {
		stripe_restricted_key_masked: string | null;
		stripe_publishable_key: string | null;
		stripe_webhook_secret_masked: string | null;
		stripe_account_id: string | null;
		stripe_connected_at: string | null;
		is_connected: boolean;
	};

	const member = getMemberContext();
	const org = getOrgContext();
	let m = $derived(member());
	let o = $derived(org());

	let status = $state<StripeStatus | null>(null);
	let loading = $state(true);
	let saving = $state(false);
	let disconnecting = $state(false);
	let fieldErrors = $state<Record<string, string>>({});

	let form = $state({
		stripe_restricted_key: '',
		stripe_publishable_key: '',
		stripe_webhook_secret: ''
	});

	let webhookUrl = $derived(
		typeof window !== 'undefined'
			? `${window.location.origin}/api/webhooks/stripe?org_id=${o.id}`
			: `/api/webhooks/stripe?org_id=${o.id}`
	);

	onMount(() => {
		if (m.role !== 'admin') {
			goto('/settings');
			return;
		}
		void load();
	});

	async function load() {
		loading = true;
		try {
			const res = await fetch('/api/settings/stripe');
			const body = (await res.json()) as { data?: StripeStatus; error?: string };
			if (!res.ok || !body.data) {
				toast.error(body.error ?? 'Failed to load Stripe settings');
				return;
			}
			status = body.data;
		} finally {
			loading = false;
		}
	}

	async function save() {
		saving = true;
		fieldErrors = {};
		try {
			const res = await fetch('/api/settings/stripe', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(form)
			});
			const body = (await res.json()) as {
				data?: StripeStatus;
				error?: string;
				field_errors?: Record<string, string>;
			};
			if (!res.ok) {
				fieldErrors = body.field_errors ?? {};
				toast.error(body.error ?? 'Save failed');
				return;
			}
			if (body.data) {
				status = body.data;
				form = {
					stripe_restricted_key: '',
					stripe_publishable_key: '',
					stripe_webhook_secret: ''
				};
				toast.success('Stripe connected');
			}
		} catch {
			toast.error('Save failed');
		} finally {
			saving = false;
		}
	}

	async function disconnect() {
		if (!window.confirm('Disconnect Stripe? Customers won’t be able to pay invoices online until you reconnect.')) {
			return;
		}
		disconnecting = true;
		try {
			const res = await fetch('/api/settings/stripe', { method: 'DELETE' });
			if (!res.ok) {
				toast.error('Disconnect failed');
				return;
			}
			toast.success('Stripe disconnected');
			void load();
		} finally {
			disconnecting = false;
		}
	}
</script>

<svelte:head><title>Stripe Settings</title></svelte:head>

<PageWrapper title="Stripe" subtitle="Accept invoice payments online">
	{#if loading || !status}
		<SkeletonLoader lines={6} label="Loading Stripe settings" height="64px" />
	{:else}
		<div class="flex flex-col gap-6">
			<StripeConnectionCard
				isConnected={status.is_connected}
				restrictedKeyMasked={status.stripe_restricted_key_masked}
				publishableKey={status.stripe_publishable_key}
				webhookSecretMasked={status.stripe_webhook_secret_masked}
				accountId={status.stripe_account_id}
				connectedAt={status.stripe_connected_at}
				{webhookUrl}
			/>

			<form
				class="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 md:p-5"
				onsubmit={(e) => {
					e.preventDefault();
					void save();
				}}
			>
				<header>
					<h3 class="text-base font-semibold text-foreground">
						{status.is_connected ? 'Replace credentials' : 'Connect Stripe'}
					</h3>
					<p class="text-xs text-muted-foreground">
						Paste your restricted key, publishable key, and webhook secret. We’ll test the connection before saving.
					</p>
				</header>

				<div class="flex flex-col gap-1.5">
					<Label for="rk">Restricted key <span class="text-destructive">*</span></Label>
					<Input
						id="rk"
						type="password"
						autocomplete="off"
						placeholder="rk_live_…"
						bind:value={form.stripe_restricted_key}
						required
					/>
					{#if fieldErrors.stripe_restricted_key}
						<p class="text-xs text-destructive">{fieldErrors.stripe_restricted_key}</p>
					{/if}
				</div>

				<div class="flex flex-col gap-1.5">
					<Label for="pk">Publishable key <span class="text-destructive">*</span></Label>
					<Input
						id="pk"
						placeholder="pk_live_…"
						bind:value={form.stripe_publishable_key}
						required
					/>
					{#if fieldErrors.stripe_publishable_key}
						<p class="text-xs text-destructive">{fieldErrors.stripe_publishable_key}</p>
					{/if}
				</div>

				<div class="flex flex-col gap-1.5">
					<Label for="ws">Webhook signing secret <span class="text-destructive">*</span></Label>
					<Input
						id="ws"
						type="password"
						autocomplete="off"
						placeholder="whsec_…"
						bind:value={form.stripe_webhook_secret}
						required
					/>
					{#if fieldErrors.stripe_webhook_secret}
						<p class="text-xs text-destructive">{fieldErrors.stripe_webhook_secret}</p>
					{/if}
				</div>

				<footer class="flex flex-wrap items-center justify-end gap-2">
					{#if status.is_connected}
						<Button
							variant="destructive"
							type="button"
							disabled={disconnecting}
							onclick={disconnect}
						>
							{disconnecting ? 'Disconnecting…' : 'Disconnect'}
						</Button>
					{/if}
					<Button type="submit" disabled={saving}>
						{saving ? 'Testing connection…' : status.is_connected ? 'Replace credentials' : 'Connect'}
					</Button>
				</footer>
			</form>
		</div>
	{/if}
</PageWrapper>
