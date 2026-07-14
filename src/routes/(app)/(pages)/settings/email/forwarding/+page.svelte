<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { onMount, onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import PageWrapper from '$lib/components/shared/PageWrapper.svelte';
	import SkeletonLoader from '$lib/components/shared/SkeletonLoader.svelte';
	import { toast } from '$lib/stores/toast.svelte';
	import { getMemberContext } from '$lib/context/member';
	import { formatRelativeShort } from '$lib/utils/format';

	type ForwardTestState = {
		status: 'pending' | 'passed' | 'expired' | null;
		email: string | null;
		sent_at: string | null;
		verified_at: string | null;
	};

	type ForwardingState = {
		forwarding_address: string | null;
		domain_status: 'pending' | 'verifying' | 'verified' | 'failed' | null;
		last_email_received_at: string | null;
		captured_this_week: number;
		forward_test: ForwardTestState;
		health: 'active' | 'idle' | 'needs_attention' | null;
	};

	const member = getMemberContext();
	let m = $derived(member());

	let data = $state<ForwardingState | null>(null);
	let loading = $state(true);
	let copied = $state(false);

	// Forwarding verification (Stage 1.3).
	let testEmail = $state('');
	let testEmailError = $state<string | null>(null);
	let sending = $state(false);
	let pollTimer: ReturnType<typeof setInterval> | null = null;
	let pollCount = 0;
	const MAX_POLLS = 36; // poll every 5s for ~3 min, then stop

	type Provider = 'gmail' | 'outlook' | 'other';
	let provider = $state<Provider>('gmail');

	const PROVIDERS: { id: Provider; label: string }[] = [
		{ id: 'gmail', label: 'Gmail' },
		{ id: 'outlook', label: 'Outlook' },
		{ id: 'other', label: 'Other' }
	];

	// Step-by-step instructions per provider. Kept as plain strings so the contractor
	// can follow along without any jargon (researched 2026-06-19).
	const GMAIL_STEPS = [
		'Open Gmail in a web browser, click the gear icon, then "See all settings".',
		'Go to the "Forwarding and POP/IMAP" tab and click "Add a forwarding address".',
		'Paste the forwarding address above, click Next, then Proceed and OK.',
		'Gmail sends a confirmation code to that address — it lands here in your CRM inbox. Open it and click the verification link.',
		'Back in Gmail, choose "Forward a copy of incoming mail to" (keep Gmail\'s copy) and click "Save Changes".'
	];

	const OUTLOOK_STEPS = [
		'Open Outlook.com in a web browser and click the gear icon to open Settings.',
		'Go to Mail → Forwarding.',
		'Turn on "Enable forwarding" and enter the forwarding address above.',
		'Tick "Keep a copy of forwarded messages", then click Save.'
	];

	const OTHER_STEPS = [
		'Open your email provider\'s settings and look for a "Forwarding" option.',
		'Add the forwarding address above as a new forwarding destination.',
		'If your provider emails a confirmation code, it will arrive here in your CRM inbox — open it and confirm.',
		'Turn forwarding on and save. New emails will start flowing into your inbox.'
	];

	let steps = $derived(
		provider === 'gmail' ? GMAIL_STEPS : provider === 'outlook' ? OUTLOOK_STEPS : OTHER_STEPS
	);

	const STATUS_META = {
		verified: { label: 'Forwarding ready', icon: 'ri-mail-check-line', tone: 'success' },
		verifying: { label: 'Domain verifying', icon: 'ri-loader-4-line', tone: 'info' },
		pending: { label: 'Setup pending', icon: 'ri-time-line', tone: 'warning' },
		failed: { label: 'Verification failed', icon: 'ri-error-warning-line', tone: 'danger' }
	} as const;

	// Stage 4 — consolidated "is forwarding working?" status. Server computes the value;
	// here we just map it to copy + colour.
	const HEALTH_META = {
		active: {
			label: 'Active',
			icon: 'ri-mail-check-line',
			tone: 'success',
			body: 'Emails are flowing into your CRM inbox.'
		},
		idle: {
			label: 'Waiting for first email',
			icon: 'ri-time-line',
			tone: 'info',
			body: 'Forwarding is set up. The moment a new email arrives in your inbox, it’ll show up here.'
		},
		needs_attention: {
			label: 'Needs attention',
			icon: 'ri-error-warning-line',
			tone: 'warning',
			body: 'We sent a test but it never came back. Check your forwarding rule is turned on, then run the test below again.'
		}
	} as const;

	// Background refresh cadence while the screen is open (Stage 4). Settings pages are
	// checked occasionally, so a light poll keeps the health numbers fresh without a
	// realtime subscription on the busy messages table.
	const HEALTH_REFRESH_MS = 30000;
	let healthTimer: ReturnType<typeof setInterval> | null = null;

	onMount(() => {
		if (m.role !== 'admin') {
			goto('/settings');
			return;
		}
		void load();
		startHealthRefresh();
		document.addEventListener('visibilitychange', handleVisibility);
		window.addEventListener('focus', handleFocus);
	});

	onDestroy(() => {
		stopPolling();
		stopHealthRefresh();
		document.removeEventListener('visibilitychange', handleVisibility);
		window.removeEventListener('focus', handleFocus);
	});

	function startHealthRefresh() {
		if (healthTimer) return;
		healthTimer = setInterval(() => {
			// The test poll (pollTimer) already refreshes every 5s while a test is pending —
			// don't double-fetch. Skip while the tab is hidden to save work.
			if (pollTimer || document.hidden) return;
			void load();
		}, HEALTH_REFRESH_MS);
	}

	function stopHealthRefresh() {
		if (healthTimer) clearInterval(healthTimer);
		healthTimer = null;
	}

	function handleVisibility() {
		if (!document.hidden) void load();
	}

	function handleFocus() {
		void load();
	}

	async function load() {
		loading = true;
		try {
			const res = await fetch('/api/settings/email/forwarding');
			const body = (await res.json()) as { data?: ForwardingState; error?: string };
			if (!res.ok || !body.data) {
				toast.error(body.error ?? 'Failed to load forwarding settings');
				return;
			}
			data = body.data;
			if (!testEmail) testEmail = data.forward_test.email ?? m.email ?? '';
			// Resume/stop polling based on the latest test status.
			if (data.forward_test.status === 'pending') startPolling();
			else stopPolling();
		} finally {
			loading = false;
		}
	}

	function stopPolling() {
		if (pollTimer) clearInterval(pollTimer);
		pollTimer = null;
		pollCount = 0;
	}

	function startPolling() {
		if (pollTimer) return; // already running
		pollCount = 0;
		pollTimer = setInterval(() => {
			pollCount += 1;
			if (pollCount > MAX_POLLS) {
				stopPolling();
				return;
			}
			void load();
		}, 5000);
	}

	async function sendTest() {
		const email = testEmail.trim();
		if (!email) return;
		testEmailError = null;
		sending = true;
		try {
			const res = await fetch('/api/settings/email/forwarding/test', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ email })
			});
			const body = (await res.json()) as {
				data?: ForwardingState;
				error?: string;
				field_errors?: { email?: string };
			};
			if (!res.ok || !body.data) {
				testEmailError = body.field_errors?.email ?? null;
				toast.error(body.error ?? 'Could not send verification email');
				return;
			}
			data = body.data;
			toast.success('Verification email sent');
			startPolling();
		} finally {
			sending = false;
		}
	}

	async function copyAddress() {
		if (!data?.forwarding_address) return;
		try {
			await navigator.clipboard.writeText(data.forwarding_address);
			copied = true;
			toast.success('Address copied');
			setTimeout(() => (copied = false), 2000);
		} catch {
			toast.error('Could not copy — copy it manually');
		}
	}
</script>

<svelte:head><title>Email Forwarding</title></svelte:head>

<PageWrapper
	title="Receive emails"
	subtitle="Forward your inbox into the CRM"
	back="/settings/email"
>
	{#if loading || !data}
		<SkeletonLoader lines={6} label="Loading forwarding settings" />
	{:else if data.forwarding_address}
		{@const meta = STATUS_META.verified}
		<div class="email-page">
			<!-- Overall health status (Stage 4) -->
			{#if data.health}
				{@const h = HEALTH_META[data.health]}
				<section class="email-section">
					<div class="email-health">
						<span class="email-circle email-circle--{h.tone}">
							<i class={h.icon} aria-hidden="true"></i>
						</span>
						<div class="email-health__body">
							<div class="email-health__row">
								<h3 class="email-health__title">Email forwarding</h3>
								<span class="email-pill email-pill--{h.tone}">{h.label}</span>
							</div>
							<p class="email-health__text">{h.body}</p>
						</div>
					</div>
				</section>
			{/if}

			<!-- Forwarding address -->
			<section class="email-section">
				<div class="email-section__head">
					<div>
						<h3 class="email-section__title">Your forwarding address</h3>
						<p class="email-section__desc">
							Forward emails from your normal inbox to this address and they'll appear in your CRM
							inbox automatically.
						</p>
					</div>
					<span class="email-pill email-pill--{meta.tone}">
						<i class={meta.icon} aria-hidden="true"></i>
						{meta.label}
					</span>
				</div>

				<div class="email-test">
					<div class="email-mono email-test__field">
						<p>{data.forwarding_address}</p>
					</div>
					<Button variant="secondary" onclick={() => void copyAddress()}>
						{#if copied}
							<i class="ri-check-line" aria-hidden="true"></i>
							Copied
						{:else}
							<i class="ri-file-copy-line" aria-hidden="true"></i>
							Copy
						{/if}
					</Button>
				</div>
			</section>

			<!-- Setup instructions -->
			<section class="email-section">
				<div>
					<h3 class="email-section__title">How to set up forwarding</h3>
					<p class="email-section__desc">
						Pick your email provider and follow the steps. You only do this once.
					</p>
				</div>

				<div class="email-providers">
					{#each PROVIDERS as p (p.id)}
						<button
							type="button"
							onclick={() => (provider = p.id)}
							class="email-provider"
							class:email-provider--active={provider === p.id}
							aria-pressed={provider === p.id}
						>
							{p.label}
						</button>
					{/each}
				</div>

				<ol class="email-steps">
					{#each steps as step, i (i)}
						<li class="email-step">
							<span class="email-step__num">{i + 1}</span>
							<p class="email-step__text">{step}</p>
						</li>
					{/each}
				</ol>
			</section>

			<!-- Verify forwarding -->
			<section class="email-section">
				<div>
					<h3 class="email-section__title">Verify forwarding</h3>
					<p class="email-section__desc">
						Send a test to the inbox you set up forwarding on. If it's working, the test lands back
						here and turns green — no junk contact is created.
					</p>
				</div>

				{#if data.forward_test.status === 'passed'}
					<div class="email-note email-note--success">
						<i class="ri-mail-check-line" aria-hidden="true"></i>
						<p>
							Forwarding confirmed{data.forward_test.verified_at
								? ` ${formatRelativeShort(data.forward_test.verified_at)}`
								: ''}. Emails from {data.forward_test.email ?? 'your inbox'} are flowing into your CRM.
						</p>
					</div>
				{:else if data.forward_test.status === 'pending'}
					<div class="email-note email-note--info">
						<i class="ri-loader-4-line email-spin" aria-hidden="true"></i>
						<p>
							Waiting for the test email to forward back{data.forward_test.email
								? ` from ${data.forward_test.email}`
								: ''}… This usually takes a few seconds once your forwarding rule is on.
						</p>
					</div>
				{:else if data.forward_test.status === 'expired'}
					<div class="email-note email-note--warning">
						<i class="ri-error-warning-line" aria-hidden="true"></i>
						<p>
							We didn't see the test come back. Double-check your forwarding rule is turned on for
							this inbox, then try again.
						</p>
					</div>
				{/if}

				<div class="email-test">
					<div class="email-test__field">
						<input
							type="email"
							inputmode="email"
							autocomplete="email"
							bind:value={testEmail}
							disabled={sending}
							placeholder="you@yourbusiness.com"
							aria-label="Inbox to verify"
							class="field__input email-test__input"
							class:field__input--error={testEmailError}
						/>
						{#if testEmailError}
							<p class="field__error">{testEmailError}</p>
						{/if}
					</div>
					<Button
						disabled={!testEmail.trim()}
						loading={sending}
						loadingLabel="Sending…"
						onclick={() => void sendTest()}
					>
						<i class="ri-send-plane-line" aria-hidden="true"></i>
						{data.forward_test.status === 'pending'
							? 'Resend'
							: data.forward_test.status
								? 'Send again'
								: 'Send verification email'}
					</Button>
				</div>
				<p class="email-section__desc">
					Use the inbox you configured forwarding on — it can be different from your login email.
				</p>
			</section>

			<!-- Health summary -->
			<section class="email-section">
				<div>
					<h3 class="email-section__title">Forwarding health</h3>
					<p class="email-section__desc">A quick look at what's coming in.</p>
				</div>

				<div class="email-stats">
					<div class="email-stat">
						<p class="email-stat__label">Last email received</p>
						<p class="email-stat__value">
							{data.last_email_received_at
								? formatRelativeShort(data.last_email_received_at)
								: 'None yet'}
						</p>
					</div>
					<div class="email-stat">
						<p class="email-stat__label">Captured this week</p>
						<p class="email-stat__value">{data.captured_this_week}</p>
					</div>
				</div>

				{#if !data.last_email_received_at}
					<div class="email-note email-note--info">
						<i class="ri-inbox-line" aria-hidden="true"></i>
						<p>
							No emails captured yet. Once you finish the steps above and a new email arrives in
							your normal inbox, it'll show up here.
						</p>
					</div>
				{/if}
			</section>
		</div>
	{:else}
		<!-- Domain not verified yet — point to the existing request flow -->
		{@const status = data.domain_status}
		{@const meta = status ? STATUS_META[status] : null}
		<div class="email-page">
			<section class="email-section">
				<div class="email-section__head">
					<div>
						<h3 class="email-section__title">Email forwarding</h3>
						<p class="email-section__desc">
							Forward your existing inbox into the CRM so customer replies land in one place.
						</p>
					</div>
					{#if meta}
						<span class="email-pill email-pill--{meta.tone}">
							<i class="{meta.icon}{status === 'verifying' ? ' email-spin' : ''}" aria-hidden="true"
							></i>
							{meta.label}
						</span>
					{/if}
				</div>

				<div class="email-note email-note--warning">
					<i class="ri-time-line" aria-hidden="true"></i>
					<p>
						{status === 'verified'
							? 'Your domain is set up but no forwarding address is available yet — please contact support.'
							: status
								? 'Your branded email domain is still being set up. Forwarding becomes available as soon as it’s verified.'
								: 'You need a branded email domain before you can forward emails in. Request yours on the Email page — we handle the setup for you.'}
					</p>
				</div>

				<footer class="email-section__footer">
					<Button onclick={() => goto('/settings/email')}>
						Go to Email settings
						<i class="ri-arrow-right-line" aria-hidden="true"></i>
					</Button>
				</footer>
			</section>
		</div>
	{/if}
</PageWrapper>
