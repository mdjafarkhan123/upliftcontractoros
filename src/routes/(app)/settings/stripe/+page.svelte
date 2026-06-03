<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import PageWrapper from '$lib/components/shared/PageWrapper.svelte';
	import SkeletonLoader from '$lib/components/shared/SkeletonLoader.svelte';
	import StripeConnectionCard from '$lib/components/settings/StripeConnectionCard.svelte';
	import StripeSetupGuide from '$lib/components/settings/StripeSetupGuide.svelte';
	import StripeTestInvoice from '$lib/components/settings/StripeTestInvoice.svelte';
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
		stripe_account_name: string | null;
		stripe_account_email: string | null;
		stripe_livemode: boolean | null;
		stripe_connected_at: string | null;
		stripe_last_verified_at: string | null;
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
				toast.success(
					body.data.stripe_livemode
						? 'Stripe connected · live mode'
						: 'Stripe connected · test mode'
				);
			}
		} catch {
			toast.error('Save failed');
		} finally {
			saving = false;
		}
	}

	async function disconnect() {
		if (
			!window.confirm(
				'Disconnect Stripe? Customers won’t be able to pay invoices online until you reconnect.'
			)
		) {
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

	function handleVerified(next: {
		livemode: boolean;
		stripe_account_id: string | null;
		stripe_account_name: string | null;
		stripe_account_email: string | null;
		stripe_last_verified_at: string;
	}) {
		if (!status) return;
		status = {
			...status,
			stripe_livemode: next.livemode,
			stripe_account_id: next.stripe_account_id,
			stripe_account_name: next.stripe_account_name,
			stripe_account_email: next.stripe_account_email,
			stripe_last_verified_at: next.stripe_last_verified_at
		};
	}
</script>

<svelte:head><title>Stripe Settings</title></svelte:head>

<PageWrapper
	title="Online payments"
	subtitle="Get paid by card on every invoice you send."
	back="/settings"
>
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
				accountName={status.stripe_account_name}
				accountEmail={status.stripe_account_email}
				livemode={status.stripe_livemode}
				connectedAt={status.stripe_connected_at}
				lastVerifiedAt={status.stripe_last_verified_at}
				{webhookUrl}
				onVerified={handleVerified}
			/>

			{#if status.is_connected && status.stripe_livemode === false}
				<StripeTestInvoice defaultEmail={m.email} />
			{/if}

			<StripeSetupGuide {webhookUrl} defaultOpen={!status.is_connected} />

			<form
				class="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm"
				onsubmit={(e) => {
					e.preventDefault();
					void save();
				}}
			>
				<header>
					<h3 class="text-base font-semibold text-foreground">
						{status.is_connected ? 'Update your Stripe keys' : 'Paste your Stripe keys'}
					</h3>
					<p class="text-xs text-muted-foreground">
						We’ll test the connection with Stripe before saving anything.
					</p>
				</header>

				<div class="flex flex-col gap-1.5">
					<Label for="rk">Restricted key <span class="text-destructive">*</span></Label>
					<Input
						id="rk"
						type="password"
						autocomplete="off"
						placeholder="rk_live_… or rk_test_…"
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
						placeholder="pk_live_… or pk_test_…"
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
							{disconnecting ? 'Disconnecting…' : 'Disconnect Stripe'}
						</Button>
					{/if}
					<Button type="submit" disabled={saving}>
						{saving
							? 'Testing connection…'
							: status.is_connected
								? 'Save changes'
								: 'Connect Stripe'}
					</Button>
				</footer>
			</form>
		</div>
	{/if}
</PageWrapper>
