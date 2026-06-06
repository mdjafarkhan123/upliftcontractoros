<script lang="ts">
	import { onMount } from 'svelte';
	import { goto, replaceState } from '$app/navigation';
	import { page } from '$app/state';
	import PageWrapper from '$lib/components/shared/PageWrapper.svelte';
	import SkeletonLoader from '$lib/components/shared/SkeletonLoader.svelte';
	import { Button } from '$lib/components/ui/button';
	import { toast } from '$lib/stores/toast.svelte';
	import { getMemberContext } from '$lib/context/member';
	import { getFeatureFlagsContext } from '$lib/context/featureFlags';
	import { MessageCircle, CreditCard } from '@lucide/svelte';

	type MessengerStatus = {
		is_connected: boolean;
		page_name: string | null;
		connected_at: string | null;
	};
	type StripeStatus = { is_connected: boolean };

	const member = getMemberContext();
	const featureFlags = getFeatureFlagsContext();
	let m = $derived(member());
	let flags = $derived(featureFlags());

	let loading = $state(true);
	let disconnecting = $state(false);
	let messenger = $state<MessengerStatus | null>(null);
	let stripe = $state<StripeStatus | null>(null);

	// The OAuth callback + chooser redirect back here with ?messenger=<reason>.
	// 'connected' is a success; every other code is a fault to surface as an error.
	const MESSENGER_TOASTS: Record<string, { variant: 'success' | 'error'; text: string }> = {
		connected: { variant: 'success', text: 'Facebook Page connected.' },
		cancelled: { variant: 'error', text: 'Facebook connection was cancelled.' },
		not_enabled: { variant: 'error', text: 'Messenger isn’t enabled on your plan.' },
		no_pages: { variant: 'error', text: 'No Facebook Pages were found on your account.' },
		page_taken: {
			variant: 'error',
			text: 'That Facebook Page is already connected to another account.'
		},
		subscribe_failed: {
			variant: 'error',
			text: 'Couldn’t subscribe the Page to messages. Please try again.'
		},
		exchange_failed: { variant: 'error', text: 'Facebook sign-in failed. Please try again.' },
		invalid_state: { variant: 'error', text: 'The connection expired. Please try again.' }
	};

	onMount(() => {
		if (m.role !== 'admin') {
			goto('/settings');
			return;
		}
		const reason = page.url.searchParams.get('messenger');
		if (reason) {
			const t = MESSENGER_TOASTS[reason];
			if (t) toast[t.variant](t.text);
			// Strip the query param so a refresh doesn't re-fire the toast.
			replaceState('/settings/integrations', page.state);
		}
		void load();
	});

	async function load() {
		loading = true;
		try {
			const [mRes, sRes] = await Promise.all([
				fetch('/api/settings/messenger').catch(() => null),
				fetch('/api/settings/stripe').catch(() => null)
			]);
			const mBody = (mRes ? await mRes.json().catch(() => ({})) : {}) as { data?: MessengerStatus };
			const sBody = (sRes ? await sRes.json().catch(() => ({})) : {}) as { data?: StripeStatus };
			messenger = mBody.data ?? { is_connected: false, page_name: null, connected_at: null };
			stripe = sBody.data ?? { is_connected: false };
		} finally {
			loading = false;
		}
	}

	async function disconnectMessenger() {
		if (
			!window.confirm(
				'Disconnect Messenger? You won’t send or receive Facebook messages until you reconnect.'
			)
		) {
			return;
		}
		disconnecting = true;
		try {
			const res = await fetch('/api/settings/messenger', { method: 'DELETE' });
			if (!res.ok) {
				toast.error('Disconnect failed');
				return;
			}
			toast.success('Messenger disconnected');
			messenger = { is_connected: false, page_name: null, connected_at: null };
		} catch {
			toast.error('Disconnect failed');
		} finally {
			disconnecting = false;
		}
	}

	function connectMessenger() {
		// Full-page navigation: the server route 302s to Facebook's OAuth dialog,
		// which a client-side goto() can't follow.
		window.location.href = '/api/settings/messenger/connect';
	}

	function formatDate(iso: string | null): string {
		if (!iso) return '';
		return new Date(iso).toLocaleDateString(undefined, {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		});
	}
</script>

<svelte:head><title>Integrations</title></svelte:head>

<PageWrapper
	title="Integrations"
	subtitle="Connect the tools your business runs on."
	back="/settings"
>
	{#if loading}
		<SkeletonLoader lines={2} label="Loading integrations" height="104px" />
	{:else}
		<div class="flex flex-col gap-4">
			<!-- Messenger -->
			<div
				class="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between"
			>
				<div class="flex items-start gap-4">
					<div
						class="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400"
					>
						<MessageCircle class="h-6 w-6" />
					</div>
					<div class="min-w-0">
						<div class="flex flex-wrap items-center gap-2">
							<h3 class="text-base font-semibold text-foreground">Messenger</h3>
							{#if !flags.feature_messenger}
								<span
									class="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
								>
									Not on your plan
								</span>
							{:else if messenger?.is_connected}
								<span
									class="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-400"
								>
									Connected
								</span>
							{/if}
						</div>
						<p class="mt-0.5 text-sm text-muted-foreground">
							{#if flags.feature_messenger && messenger?.is_connected}
								{messenger.page_name ?? 'Facebook Page'}{messenger.connected_at
									? ` · since ${formatDate(messenger.connected_at)}`
									: ''}
							{:else}
								Reply to Facebook messages from your inbox.
							{/if}
						</p>
					</div>
				</div>
				{#if flags.feature_messenger}
					<div class="shrink-0">
						{#if messenger?.is_connected}
							<Button
								variant="destructive"
								disabled={disconnecting}
								onclick={disconnectMessenger}
							>
								{disconnecting ? 'Disconnecting…' : 'Disconnect'}
							</Button>
						{:else}
							<Button onclick={connectMessenger}>Connect Facebook Page</Button>
						{/if}
					</div>
				{/if}
			</div>

			<!-- Payments -->
			<div
				class="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between"
			>
				<div class="flex items-start gap-4">
					<div
						class="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400"
					>
						<CreditCard class="h-6 w-6" />
					</div>
					<div class="min-w-0">
						<div class="flex flex-wrap items-center gap-2">
							<h3 class="text-base font-semibold text-foreground">Payments</h3>
							{#if !flags.feature_stripe_payments}
								<span
									class="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
								>
									Not on your plan
								</span>
							{:else if stripe?.is_connected}
								<span
									class="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-400"
								>
									Connected
								</span>
							{/if}
						</div>
						<p class="mt-0.5 text-sm text-muted-foreground">
							Accept card payments on your invoices via Stripe.
						</p>
					</div>
				</div>
				{#if flags.feature_stripe_payments}
					<div class="shrink-0">
						<Button variant="outline" onclick={() => goto('/settings/stripe')}>
							{stripe?.is_connected ? 'Manage' : 'Set up'}
						</Button>
					</div>
				{/if}
			</div>
		</div>
	{/if}
</PageWrapper>
