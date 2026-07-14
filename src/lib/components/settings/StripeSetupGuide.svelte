<script lang="ts">
	import { toast } from '$lib/stores/toast.svelte';

	let { webhookUrl, defaultOpen = false }: { webhookUrl: string; defaultOpen?: boolean } = $props();

	let open = $state(defaultOpen);

	const permissions = [
		{
			name: 'Checkout Sessions',
			level: 'Write',
			why: 'Creates the payment link your customer clicks'
		},
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

<section class="stripe-guide">
	<button type="button" class="stripe-guide__toggle" onclick={() => (open = !open)}>
		<div class="stripe-guide__toggle-left">
			<div class="stripe-guide__toggle-icon">
				<i class="ri-sparkling-line" aria-hidden="true"></i>
			</div>
			<div>
				<h3 class="stripe-guide__toggle-title">How to connect Stripe — plain English</h3>
				<p class="stripe-guide__toggle-sub">5 steps · takes about 10 minutes · only do this once</p>
			</div>
		</div>
		<i
			class="ri-arrow-down-s-line stripe-guide__chevron"
			class:stripe-guide__chevron--open={open}
			aria-hidden="true"
		></i>
	</button>

	{#if open}
		<div class="stripe-guide__body">
			<ol class="stripe-guide__steps">
				<!-- Step 1 -->
				<li class="stripe-guide__step">
					<div class="stripe-guide__num">1</div>
					<div class="stripe-guide__step-main">
						<p class="stripe-guide__step-title">Create a free Stripe account</p>
						<p class="stripe-guide__text">
							Stripe is the payment company that collects card payments from your customers and
							sends the money to your bank account. It's free to sign up — Stripe only charges a
							small fee per transaction (around 2.9% + 30¢) when you actually get paid.
						</p>
						<p class="stripe-guide__text">
							Go to <span class="stripe-guide__mono">stripe.com</span> and click
							<strong>Start now</strong>. Use your real business email. You'll need your business
							name and a bank account ready for later steps.
						</p>
						<a
							class="stripe-guide__cta"
							href="https://stripe.com/register"
							target="_blank"
							rel="noopener noreferrer"
						>
							Open Stripe sign-up →
						</a>
					</div>
				</li>

				<!-- Step 2 -->
				<li class="stripe-guide__step">
					<div class="stripe-guide__num">2</div>
					<div class="stripe-guide__step-main">
						<p class="stripe-guide__step-title">Verify your identity so Stripe can pay you out</p>
						<p class="stripe-guide__text">
							Before Stripe can deposit money into your bank, they're required by law to confirm who
							you are. This is a one-time process that usually takes 1–2 business days.
							<strong>You can skip this for now and use test keys while you wait</strong> — just come
							back to activate when you're ready for real payments.
						</p>
						<p class="stripe-guide__text">
							They'll ask for: your legal name, last 4 digits of your SSN (or full SSN for some
							accounts), your home address, your date of birth, and your bank account and routing
							numbers for payouts.
						</p>
						<div class="stripe-guide__search">
							<i class="ri-search-line" aria-hidden="true"></i>
							<span>In Stripe, use the search bar at the top and type:</span>
							<code class="stripe-guide__chip">activate account</code>
						</div>
					</div>
				</li>

				<!-- Step 3 -->
				<li class="stripe-guide__step">
					<div class="stripe-guide__num">3</div>
					<div class="stripe-guide__step-main">
						<p class="stripe-guide__step-title">Create a restricted API key</p>
						<p class="stripe-guide__text">
							An API key is a password your CRM uses to talk to Stripe on your behalf — to create
							payment links when you send invoices. We use a <strong>restricted</strong> key (not the
							full secret key) because it only allows the specific actions listed below and nothing else.
							This keeps your account safe even if something unexpected happens.
						</p>
						<div class="stripe-guide__search">
							<i class="ri-search-line" aria-hidden="true"></i>
							<span>In Stripe, search for:</span>
							<code class="stripe-guide__chip">API keys</code>
						</div>
						<p class="stripe-guide__text">
							On that page, scroll down to <strong>Restricted keys</strong> and click
							<strong>Create restricted key</strong>. Give it the name
							<span class="stripe-guide__mono">Contractor CRM</span> so you know what it's for. Then set
							these permissions:
						</p>
						<div class="stripe-guide__perms">
							<p class="stripe-guide__perms-title">Permissions to turn on:</p>
							<ul class="stripe-guide__perm-list">
								{#each permissions as p (p.name)}
									<li class="stripe-guide__perm">
										<span class="stripe-guide__perm-level">{p.level}</span>
										<span><strong>{p.name}</strong> — {p.why}</span>
									</li>
								{/each}
							</ul>
						</div>
						<p class="stripe-guide__text">
							Click <strong>Create key</strong>. Stripe will show you the key once — it starts with
							<span class="stripe-guide__mono">rk_live_</span> (or
							<span class="stripe-guide__mono">rk_test_</span> if you're in test mode). Copy it and
							paste it into the <strong>Restricted key</strong> field in the form below.
						</p>
					</div>
				</li>

				<!-- Step 4 -->
				<li class="stripe-guide__step">
					<div class="stripe-guide__num">4</div>
					<div class="stripe-guide__step-main">
						<p class="stripe-guide__step-title">Copy your publishable key</p>
						<p class="stripe-guide__text">
							The publishable key is the safe-to-share one — it's used on your customer's payment
							page and doesn't give any access to your money. You're still on the same
							<strong>API keys</strong> page from the previous step.
						</p>
						<div class="stripe-guide__search">
							<i class="ri-search-line" aria-hidden="true"></i>
							<span>Same page — search for:</span>
							<code class="stripe-guide__chip">API keys</code>
						</div>
						<p class="stripe-guide__text">
							At the top of the page, under <strong>Standard keys</strong>, you'll see the
							<strong>Publishable key</strong>. It starts with
							<span class="stripe-guide__mono">pk_live_</span> (or
							<span class="stripe-guide__mono">pk_test_</span>). Click the copy icon next to it and
							paste it into the <strong>Publishable key</strong> field below.
						</p>
						<p class="stripe-guide__note stripe-guide__note--amber">
							<strong>Important:</strong> Both your restricted key and publishable key should be the same
							mode — either both live or both test. Don't mix them.
						</p>
					</div>
				</li>

				<!-- Step 5 -->
				<li class="stripe-guide__step">
					<div class="stripe-guide__num">5</div>
					<div class="stripe-guide__step-main">
						<p class="stripe-guide__step-title">
							Add a webhook so your CRM knows when you get paid
						</p>
						<p class="stripe-guide__text">
							Without this step, Stripe will collect the money but your CRM will never know the
							invoice was paid — it'll stay stuck as "unpaid" forever. A webhook is just a
							notification Stripe sends to your CRM the moment a payment goes through.
						</p>
						<div class="stripe-guide__search">
							<i class="ri-search-line" aria-hidden="true"></i>
							<span>In Stripe, search for:</span>
							<code class="stripe-guide__chip">Webhooks</code>
						</div>
						<p class="stripe-guide__text">
							Click <strong>Add endpoint</strong>. Paste the URL below into the
							<strong>Endpoint URL</strong> field.
						</p>

						<div class="stripe-guide__perms">
							<p class="stripe-card__dt">Your webhook URL — paste this into Stripe</p>
							<div class="stripe-card__webhook-row">
								<code class="stripe-card__code">{webhookUrl}</code>
								<button type="button" class="stripe-codebtn" onclick={copyWebhook}>
									<i class="ri-file-copy-line" aria-hidden="true"></i> Copy
								</button>
							</div>
						</div>

						<p class="stripe-guide__text">
							After pasting the URL, click <strong>Select events</strong>. Search for and add these
							two events:
						</p>
						<ul class="stripe-guide__events">
							<li class="stripe-guide__event">
								<span class="stripe-guide__event-dot"></span>
								<span class="stripe-guide__mono">checkout.session.completed</span>
								<span>— customer finished checkout</span>
							</li>
							<li class="stripe-guide__event">
								<span class="stripe-guide__event-dot"></span>
								<span class="stripe-guide__mono">payment_intent.succeeded</span>
								<span>— payment was confirmed</span>
							</li>
						</ul>
						<p class="stripe-guide__text">
							Click <strong>Add endpoint</strong> to save. Then click on the webhook you just
							created. You'll see a section called <strong>Signing secret</strong> — click
							<strong>Reveal</strong> and copy that value. It starts with
							<span class="stripe-guide__mono">whsec_</span>. Paste it into the
							<strong>Webhook signing secret</strong> field below.
						</p>
					</div>
				</li>
			</ol>

			<div class="stripe-guide__note stripe-guide__note--indigo">
				<p><strong>Not ready for real customers yet?</strong></p>
				<p>
					You can use Stripe's test mode — just paste test keys (they start with
					<span class="stripe-guide__mono">rk_test_</span>,
					<span class="stripe-guide__mono">pk_test_</span>, and a test
					<span class="stripe-guide__mono">whsec_</span>). In test mode, no real money moves and you
					can send yourself a fake $1 invoice to see the whole payment flow before you go live. When
					you're ready, swap in your live keys.
				</p>
			</div>
		</div>
	{/if}
</section>
