<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import {
		MailCheck,
		Clock,
		TriangleAlert,
		Loader2,
		Copy,
		Check,
		Inbox,
		ArrowRight,
		Send
	} from '@lucide/svelte';
	import PageWrapper from '$lib/components/shared/PageWrapper.svelte';
	import SkeletonLoader from '$lib/components/shared/SkeletonLoader.svelte';
	import { Button } from '$lib/components/ui/button';
	import { toast } from '$lib/stores/toast.svelte';
	import { getMemberContext } from '$lib/context/member';
	import { formatRelativeShort } from '$lib/utils/format';
	import { cn } from '$lib/utils/cn';

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
		verified: {
			label: 'Forwarding ready',
			icon: MailCheck,
			class:
				'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20'
		},
		verifying: {
			label: 'Domain verifying',
			icon: Loader2,
			class:
				'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-500/10 dark:text-sky-400 dark:border-sky-500/20'
		},
		pending: {
			label: 'Setup pending',
			icon: Clock,
			class:
				'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20'
		},
		failed: {
			label: 'Verification failed',
			icon: TriangleAlert,
			class:
				'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20'
		}
	} as const;

	// Stage 4 — consolidated "is forwarding working?" status. Server computes the value;
	// here we just map it to copy + colour.
	const HEALTH_META = {
		active: {
			label: 'Active',
			icon: MailCheck,
			pill: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20',
			body: 'Emails are flowing into your CRM inbox.'
		},
		idle: {
			label: 'Waiting for first email',
			icon: Clock,
			pill: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-500/10 dark:text-sky-400 dark:border-sky-500/20',
			body: 'Forwarding is set up. The moment a new email arrives in your inbox, it’ll show up here.'
		},
		needs_attention: {
			label: 'Needs attention',
			icon: TriangleAlert,
			pill: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20',
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
		<div class="flex flex-col gap-6">
			<!-- Overall health status (Stage 4) -->
			{#if data.health}
				{@const h = HEALTH_META[data.health]}
				<section
					class="flex items-start gap-3 rounded-xl border border-border/60 bg-card p-4 shadow-card"
				>
					<span
						class={cn(
							'flex h-9 w-9 shrink-0 items-center justify-center rounded-full border',
							h.pill
						)}
					>
						<h.icon class="h-4 w-4" />
					</span>
					<div class="min-w-0 flex-1">
						<div class="flex items-center gap-2">
							<h3 class="text-sm font-semibold text-foreground">Email forwarding</h3>
							<span
								class={cn(
									'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium',
									h.pill
								)}
							>
								{h.label}
							</span>
						</div>
						<p class="mt-0.5 text-xs text-muted-foreground">{h.body}</p>
					</div>
				</section>
			{/if}

			<!-- Forwarding address -->
			<section
				class="flex flex-col gap-3 rounded-xl border border-border/60 bg-card p-4 shadow-card"
			>
				<div class="flex items-start justify-between gap-3">
					<div class="min-w-0">
						<h3 class="text-sm font-semibold text-foreground">Your forwarding address</h3>
						<p class="text-xs text-muted-foreground">
							Forward emails from your normal inbox to this address and they'll appear in your CRM
							inbox automatically.
						</p>
					</div>
					<span
						class={cn(
							'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium',
							meta.class
						)}
					>
						<meta.icon class="h-3 w-3" />
						{meta.label}
					</span>
				</div>

				<div class="flex items-stretch gap-2">
					<div
						class="flex min-w-0 flex-1 items-center rounded-lg border border-border/50 bg-muted/30 px-3 py-2.5"
					>
						<p class="truncate font-mono text-sm text-foreground">{data.forwarding_address}</p>
					</div>
					<Button
						type="button"
						variant="outline"
						class="shrink-0"
						onclick={() => void copyAddress()}
					>
						{#if copied}
							<Check class="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
							Copied
						{:else}
							<Copy class="h-4 w-4" />
							Copy
						{/if}
					</Button>
				</div>
			</section>

			<!-- Setup instructions -->
			<section
				class="flex flex-col gap-3 rounded-xl border border-border/60 bg-card p-4 shadow-card"
			>
				<div>
					<h3 class="text-sm font-semibold text-foreground">How to set up forwarding</h3>
					<p class="text-xs text-muted-foreground">
						Pick your email provider and follow the steps. You only do this once.
					</p>
				</div>

				<div class="flex gap-1.5">
					{#each PROVIDERS as p (p.id)}
						<button
							type="button"
							onclick={() => (provider = p.id)}
							class={cn(
								'flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
								provider === p.id
									? 'border-primary/40 bg-primary/5 text-primary ring-1 ring-primary/20'
									: 'border-border/60 bg-card text-muted-foreground hover:border-border hover:bg-muted/30'
							)}
							aria-pressed={provider === p.id}
						>
							{p.label}
						</button>
					{/each}
				</div>

				<ol class="flex flex-col gap-2.5">
					{#each steps as step, i (i)}
						<li class="flex gap-3">
							<span
								class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary"
							>
								{i + 1}
							</span>
							<p class="pt-0.5 text-sm leading-relaxed text-foreground">{step}</p>
						</li>
					{/each}
				</ol>
			</section>

			<!-- Verify forwarding -->
			<section
				class="flex flex-col gap-3 rounded-xl border border-border/60 bg-card p-4 shadow-card"
			>
				<div>
					<h3 class="text-sm font-semibold text-foreground">Verify forwarding</h3>
					<p class="text-xs text-muted-foreground">
						Send a test to the inbox you set up forwarding on. If it's working, the test lands back
						here and turns green — no junk contact is created.
					</p>
				</div>

				{#if data.forward_test.status === 'passed'}
					<div
						class="flex items-start gap-2.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 dark:border-emerald-500/20 dark:bg-emerald-500/10"
					>
						<MailCheck class="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
						<p class="text-xs text-emerald-800 dark:text-emerald-300">
							Forwarding confirmed{data.forward_test.verified_at
								? ` ${formatRelativeShort(data.forward_test.verified_at)}`
								: ''}. Emails from {data.forward_test.email ?? 'your inbox'} are flowing into your CRM.
						</p>
					</div>
				{:else if data.forward_test.status === 'pending'}
					<div
						class="flex items-start gap-2.5 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2.5 dark:border-sky-500/20 dark:bg-sky-500/10"
					>
						<Loader2 class="mt-0.5 h-4 w-4 shrink-0 animate-spin text-sky-600 dark:text-sky-400" />
						<p class="text-xs text-sky-800 dark:text-sky-300">
							Waiting for the test email to forward back{data.forward_test.email
								? ` from ${data.forward_test.email}`
								: ''}… This usually takes a few seconds once your forwarding rule is on.
						</p>
					</div>
				{:else if data.forward_test.status === 'expired'}
					<div
						class="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 dark:border-amber-500/20 dark:bg-amber-500/10"
					>
						<TriangleAlert class="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
						<p class="text-xs text-amber-800 dark:text-amber-300">
							We didn't see the test come back. Double-check your forwarding rule is turned on for
							this inbox, then try again.
						</p>
					</div>
				{/if}

				<div class="flex flex-col gap-2 sm:flex-row sm:items-start">
					<div class="min-w-0 flex-1">
						<input
							type="email"
							inputmode="email"
							autocomplete="email"
							bind:value={testEmail}
							disabled={sending}
							placeholder="you@yourbusiness.com"
							aria-label="Inbox to verify"
							class={cn(
								'w-full rounded-lg border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-60',
								testEmailError ? 'border-rose-300 dark:border-rose-500/40' : 'border-border/60'
							)}
						/>
						{#if testEmailError}
							<p class="mt-1 text-xs text-rose-600 dark:text-rose-400">{testEmailError}</p>
						{/if}
					</div>
					<Button
						type="button"
						class="shrink-0"
						disabled={sending || !testEmail.trim()}
						onclick={() => void sendTest()}
					>
						{#if sending}
							<Loader2 class="h-4 w-4 animate-spin" />
							Sending…
						{:else}
							<Send class="h-4 w-4" />
							{data.forward_test.status === 'pending'
								? 'Resend'
								: data.forward_test.status
									? 'Send again'
									: 'Send verification email'}
						{/if}
					</Button>
				</div>
				<p class="text-xs text-muted-foreground">
					Use the inbox you configured forwarding on — it can be different from your login email.
				</p>
			</section>

			<!-- Health summary -->
			<section
				class="flex flex-col gap-3 rounded-xl border border-border/60 bg-card p-4 shadow-card"
			>
				<div>
					<h3 class="text-sm font-semibold text-foreground">Forwarding health</h3>
					<p class="text-xs text-muted-foreground">A quick look at what's coming in.</p>
				</div>

				<div class="grid grid-cols-2 gap-3">
					<div class="rounded-lg border border-border/50 bg-muted/20 px-3 py-3">
						<p class="text-xs text-muted-foreground">Last email received</p>
						<p class="mt-1 text-sm font-semibold text-foreground">
							{data.last_email_received_at
								? formatRelativeShort(data.last_email_received_at)
								: 'None yet'}
						</p>
					</div>
					<div class="rounded-lg border border-border/50 bg-muted/20 px-3 py-3">
						<p class="text-xs text-muted-foreground">Captured this week</p>
						<p class="mt-1 text-sm font-semibold text-foreground">{data.captured_this_week}</p>
					</div>
				</div>

				{#if !data.last_email_received_at}
					<div
						class="flex items-start gap-2.5 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2.5 dark:border-sky-500/20 dark:bg-sky-500/10"
					>
						<Inbox class="mt-0.5 h-4 w-4 shrink-0 text-sky-600 dark:text-sky-400" />
						<p class="text-xs text-sky-800 dark:text-sky-300">
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
		<div class="flex flex-col gap-6">
			<section
				class="flex flex-col gap-3 rounded-xl border border-border/60 bg-card p-4 shadow-card"
			>
				<div class="flex items-start justify-between gap-3">
					<div class="min-w-0">
						<h3 class="text-sm font-semibold text-foreground">Email forwarding</h3>
						<p class="text-xs text-muted-foreground">
							Forward your existing inbox into the CRM so customer replies land in one place.
						</p>
					</div>
					{#if meta}
						<span
							class={cn(
								'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium',
								meta.class
							)}
						>
							<meta.icon class={cn('h-3 w-3', status === 'verifying' && 'animate-spin')} />
							{meta.label}
						</span>
					{/if}
				</div>

				<div
					class="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 dark:border-amber-500/20 dark:bg-amber-500/10"
				>
					<Clock class="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
					<p class="text-xs text-amber-800 dark:text-amber-300">
						{status === 'verified'
							? 'Your domain is set up but no forwarding address is available yet — please contact support.'
							: status
								? 'Your branded email domain is still being set up. Forwarding becomes available as soon as it’s verified.'
								: 'You need a branded email domain before you can forward emails in. Request yours on the Email page — we handle the setup for you.'}
					</p>
				</div>

				<footer class="flex items-center justify-end border-t border-border pt-4">
					<Button type="button" onclick={() => goto('/settings/email')}>
						Go to Email settings
						<ArrowRight class="h-4 w-4" />
					</Button>
				</footer>
			</section>
		</div>
	{/if}
</PageWrapper>
