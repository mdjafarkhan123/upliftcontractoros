<script lang="ts">
	import { ChevronDown, Copy, Search, Sparkles } from '@lucide/svelte';
	import { toast } from '$lib/stores/toast.svelte';

	let { webhookUrl, defaultOpen = false }: { webhookUrl: string; defaultOpen?: boolean } = $props();

	let open = $state(defaultOpen);

	const permissions = [
		{ name: 'Checkout Sessions', level: 'Write', why: 'Creates the payment link your customer clicks' },
		{ name: 'Payment Intents', level: 'Read', why: 'Checks whether a payment went through' },
		{ name: 'Charges', level: 'Read', why: 'Reads charge details for your records' },
		{ name: 'Balance', level: 'Read', why: 'Shows your current Stripe balance' },
		{ name: 'Account', level: 'Read', why: 'Pulls in your business name and email' }
	];

	async function copyWebhook() {
		try {
			await navigator.clipboard.writeText(webhookUrl);
			toast.success('Webhook URL copied');
		} catch {
			toast.error('Copy failed');
		}
	}
</script>

<section class="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
	<button
		type="button"
		class="flex w-full items-center justify-between gap-3 px-5 py-4 text-left transition hover:bg-muted/40"
		onclick={() => (open = !open)}
	>
		<div class="flex items-center gap-3">
			<div class="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-500/10 text-indigo-600">
				<Sparkles class="h-4 w-4" />
			</div>
			<div>
				<h3 class="text-base font-semibold text-foreground">How to connect Stripe — plain English</h3>
				<p class="text-xs text-muted-foreground">5 steps · takes about 10 minutes · only do this once</p>
			</div>
		</div>
		<ChevronDown class={`h-4 w-4 shrink-0 text-muted-foreground transition ${open ? 'rotate-180' : ''}`} />
	</button>

	{#if open}
		<div class="border-t border-border px-5 py-6">
			<ol class="flex flex-col gap-8">

				<!-- Step 1 -->
				<li class="flex gap-4">
					<div class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-xs font-bold text-emerald-700">1</div>
					<div class="flex-1 space-y-2">
						<p class="text-sm font-semibold text-foreground">Create a free Stripe account</p>
						<p class="text-sm text-muted-foreground">
							Stripe is the payment company that collects card payments from your customers and sends the money to your bank account. It's free to sign up — Stripe only charges a small fee per transaction (around 2.9% + 30¢) when you actually get paid.
						</p>
						<p class="text-sm text-muted-foreground">
							Go to <span class="font-mono text-foreground">stripe.com</span> and click <strong>Start now</strong>. Use your real business email. You'll need your business name and a bank account ready for later steps.
						</p>
						<a
							href="https://stripe.com/register"
							target="_blank"
							rel="noopener noreferrer"
							class="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-400 dark:hover:bg-emerald-950/60"
						>
							Open Stripe sign-up →
						</a>
					</div>
				</li>

				<!-- Step 2 -->
				<li class="flex gap-4">
					<div class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-xs font-bold text-emerald-700">2</div>
					<div class="flex-1 space-y-2">
						<p class="text-sm font-semibold text-foreground">Verify your identity so Stripe can pay you out</p>
						<p class="text-sm text-muted-foreground">
							Before Stripe can deposit money into your bank, they're required by law to confirm who you are. This is a one-time process that usually takes 1–2 business days. <strong>You can skip this for now and use test keys while you wait</strong> — just come back to activate when you're ready for real payments.
						</p>
						<p class="text-sm text-muted-foreground">
							They'll ask for: your legal name, last 4 digits of your SSN (or full SSN for some accounts), your home address, your date of birth, and your bank account and routing numbers for payouts.
						</p>
						<div class="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs">
							<Search class="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
							<span class="text-muted-foreground">In Stripe, use the search bar at the top and type:</span>
							<code class="rounded bg-background px-1.5 py-0.5 font-mono font-semibold text-foreground">activate account</code>
						</div>
					</div>
				</li>

				<!-- Step 3 -->
				<li class="flex gap-4">
					<div class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-xs font-bold text-emerald-700">3</div>
					<div class="flex-1 space-y-2">
						<p class="text-sm font-semibold text-foreground">Create a restricted API key</p>
						<p class="text-sm text-muted-foreground">
							An API key is a password your CRM uses to talk to Stripe on your behalf — to create payment links when you send invoices. We use a <strong>restricted</strong> key (not the full secret key) because it only allows the specific actions listed below and nothing else. This keeps your account safe even if something unexpected happens.
						</p>
						<div class="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs">
							<Search class="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
							<span class="text-muted-foreground">In Stripe, search for:</span>
							<code class="rounded bg-background px-1.5 py-0.5 font-mono font-semibold text-foreground">API keys</code>
						</div>
						<p class="text-sm text-muted-foreground">
							On that page, scroll down to <strong>Restricted keys</strong> and click <strong>Create restricted key</strong>. Give it the name <code class="font-mono text-xs">Contractor CRM</code> so you know what it's for. Then set these permissions:
						</p>
						<div class="rounded-lg border border-border bg-muted/30 p-3">
							<p class="text-xs font-semibold text-foreground">Permissions to turn on:</p>
							<ul class="mt-2 space-y-2">
								{#each permissions as p (p.name)}
									<li class="flex items-start gap-2 text-xs">
										<span class="mt-0.5 shrink-0 rounded bg-emerald-500/10 px-1.5 py-0.5 font-mono font-semibold text-emerald-700 dark:bg-emerald-500/20 dark:text-green-400">{p.level}</span>
										<span>
											<span class="font-semibold text-foreground">{p.name}</span>
											<span class="text-muted-foreground"> — {p.why}</span>
										</span>
									</li>
								{/each}
							</ul>
						</div>
						<p class="text-sm text-muted-foreground">
							Click <strong>Create key</strong>. Stripe will show you the key once — it starts with <code class="font-mono text-xs">rk_live_</code> (or <code class="font-mono text-xs">rk_test_</code> if you're in test mode). Copy it and paste it into the <strong>Restricted key</strong> field in the form below.
						</p>
					</div>
				</li>

				<!-- Step 4 -->
				<li class="flex gap-4">
					<div class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-xs font-bold text-emerald-700">4</div>
					<div class="flex-1 space-y-2">
						<p class="text-sm font-semibold text-foreground">Copy your publishable key</p>
						<p class="text-sm text-muted-foreground">
							The publishable key is the safe-to-share one — it's used on your customer's payment page and doesn't give any access to your money. You're still on the same <strong>API keys</strong> page from the previous step.
						</p>
						<div class="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs">
							<Search class="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
							<span class="text-muted-foreground">Same page — search for:</span>
							<code class="rounded bg-background px-1.5 py-0.5 font-mono font-semibold text-foreground">API keys</code>
						</div>
						<p class="text-sm text-muted-foreground">
							At the top of the page, under <strong>Standard keys</strong>, you'll see the <strong>Publishable key</strong>. It starts with <code class="font-mono text-xs">pk_live_</code> (or <code class="font-mono text-xs">pk_test_</code>). Click the copy icon next to it and paste it into the <strong>Publishable key</strong> field below.
						</p>
						<p class="rounded-lg bg-amber-500/5 p-3 text-xs text-amber-800 dark:text-amber-300">
							<strong>Important:</strong> Both your restricted key and publishable key should be the same mode — either both live or both test. Don't mix them.
						</p>
					</div>
				</li>

				<!-- Step 5 -->
				<li class="flex gap-4">
					<div class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-xs font-bold text-emerald-700">5</div>
					<div class="flex-1 space-y-2">
						<p class="text-sm font-semibold text-foreground">Add a webhook so your CRM knows when you get paid</p>
						<p class="text-sm text-muted-foreground">
							Without this step, Stripe will collect the money but your CRM will never know the invoice was paid — it'll stay stuck as "unpaid" forever. A webhook is just a notification Stripe sends to your CRM the moment a payment goes through.
						</p>
						<div class="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs">
							<Search class="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
							<span class="text-muted-foreground">In Stripe, search for:</span>
							<code class="rounded bg-background px-1.5 py-0.5 font-mono font-semibold text-foreground">Webhooks</code>
						</div>
						<p class="text-sm text-muted-foreground">
							Click <strong>Add endpoint</strong>. Paste the URL below into the <strong>Endpoint URL</strong> field.
						</p>

						<div class="rounded-lg border border-border bg-muted/30 p-3">
							<p class="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Your webhook URL — paste this into Stripe</p>
							<div class="mt-2 flex items-center gap-2">
								<code class="flex-1 truncate rounded bg-background px-2 py-1.5 font-mono text-xs text-foreground">{webhookUrl}</code>
								<button
									type="button"
									onclick={copyWebhook}
									class="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-border bg-background px-3 text-xs font-medium hover:bg-accent"
								>
									<Copy class="h-3 w-3" /> Copy
								</button>
							</div>
						</div>

						<p class="text-sm text-muted-foreground">
							After pasting the URL, click <strong>Select events</strong>. Search for and add these two events:
						</p>
						<ul class="space-y-1 pl-1">
							<li class="flex items-center gap-2 text-xs">
								<span class="h-1.5 w-1.5 shrink-0 rounded-full bg-foreground/40"></span>
								<code class="font-mono text-foreground">checkout.session.completed</code>
								<span class="text-muted-foreground">— customer finished checkout</span>
							</li>
							<li class="flex items-center gap-2 text-xs">
								<span class="h-1.5 w-1.5 shrink-0 rounded-full bg-foreground/40"></span>
								<code class="font-mono text-foreground">payment_intent.succeeded</code>
								<span class="text-muted-foreground">— payment was confirmed</span>
							</li>
						</ul>
						<p class="text-sm text-muted-foreground">
							Click <strong>Add endpoint</strong> to save. Then click on the webhook you just created. You'll see a section called <strong>Signing secret</strong> — click <strong>Reveal</strong> and copy that value. It starts with <code class="font-mono text-xs">whsec_</code>. Paste it into the <strong>Webhook signing secret</strong> field below.
						</p>
					</div>
				</li>

			</ol>

			<div class="mt-8 rounded-lg border border-indigo-200 bg-indigo-50/60 p-4 text-xs dark:border-indigo-900 dark:bg-indigo-950/30">
				<p class="font-semibold text-foreground">Not ready for real customers yet?</p>
				<p class="mt-1 text-muted-foreground">
					You can use Stripe's test mode — just paste test keys (they start with <code class="font-mono">rk_test_</code>, <code class="font-mono">pk_test_</code>, and a test <code class="font-mono">whsec_</code>). In test mode, no real money moves and you can send yourself a fake $1 invoice to see the whole payment flow before you go live. When you're ready, swap in your live keys.
				</p>
			</div>
		</div>
	{/if}
</section>
