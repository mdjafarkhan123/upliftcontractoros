<script lang="ts">
	import { ChevronDown, ExternalLink, Copy, Sparkles } from '@lucide/svelte';
	import { toast } from '$lib/stores/toast.svelte';

	let { webhookUrl, defaultOpen = false }: { webhookUrl: string; defaultOpen?: boolean } = $props();

	let open = $state(defaultOpen);

	const steps = [
		{
			title: 'Create your Stripe account',
			body: 'Stripe is the trusted payment processor we use to collect money for you. It takes 5 minutes — they’ll ask for your business name, bank account, and a few ID details.',
			href: 'https://dashboard.stripe.com/register',
			cta: 'Open Stripe sign-up'
		},
		{
			title: 'Generate a restricted key',
			body: 'A restricted key is a secure password that lets your CRM create payment links on your behalf. In Stripe, click “Create restricted key”, name it something like “Contractor CRM”, and grant the permissions listed below.',
			href: 'https://dashboard.stripe.com/apikeys',
			cta: 'Open Stripe API keys'
		},
		{
			title: 'Copy your publishable key',
			body: 'The publishable key is safe to share — it’s used on the customer-facing payment page. You’ll find it on the same API keys page.',
			href: 'https://dashboard.stripe.com/apikeys',
			cta: 'Open Stripe API keys'
		},
		{
			title: 'Add a webhook so we know when you’ve been paid',
			body: 'In Stripe, add a webhook pointing at the URL below. Subscribe to checkout.session.completed and payment_intent.succeeded. After saving, copy the “signing secret” Stripe shows you.',
			href: 'https://dashboard.stripe.com/webhooks',
			cta: 'Open Stripe webhooks'
		}
	];

	const requiredScopes = [
		'Checkout Sessions — Write',
		'Payment Intents — Read',
		'Charges — Read',
		'Balance — Read',
		'Account — Read (optional, lets us show your business name here)'
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
			<div
				class="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-500/10 text-indigo-600"
			>
				<Sparkles class="h-4 w-4" />
			</div>
			<div>
				<h3 class="text-base font-semibold text-foreground">How to connect Stripe</h3>
				<p class="text-xs text-muted-foreground">
					A short, plain-English walkthrough. Skip it if you’ve done this before.
				</p>
			</div>
		</div>
		<ChevronDown class={`h-4 w-4 text-muted-foreground transition ${open ? 'rotate-180' : ''}`} />
	</button>

	{#if open}
		<div class="border-t border-border px-5 py-5">
			<ol class="flex flex-col gap-5">
				{#each steps as step, i (i)}
					<li class="flex gap-3">
						<div
							class="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-emerald-500/10 text-xs font-semibold text-emerald-700"
						>
							{i + 1}
						</div>
						<div class="flex-1">
							<p class="text-sm font-semibold text-foreground">{step.title}</p>
							<p class="mt-1 text-sm text-muted-foreground">{step.body}</p>

							{#if i === 1}
								<details class="mt-2 rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs">
									<summary class="cursor-pointer font-medium text-foreground">
										Which permissions do I select?
									</summary>
									<ul class="mt-2 space-y-1 text-muted-foreground">
										{#each requiredScopes as scope (scope)}
											<li class="flex gap-2"><span class="text-foreground">•</span>{scope}</li>
										{/each}
									</ul>
								</details>
							{/if}

							{#if i === 3}
								<div class="mt-2 rounded-lg border border-border bg-muted/30 p-3">
									<p class="text-[11px] uppercase tracking-wide text-muted-foreground">
										Your webhook URL
									</p>
									<div class="mt-1 flex items-center gap-2">
										<code
											class="flex-1 truncate rounded bg-background px-2 py-1.5 font-mono text-xs text-foreground"
											>{webhookUrl}</code
										>
										<button
											type="button"
											onclick={copyWebhook}
											class="inline-flex h-8 items-center gap-1 rounded-md border border-border bg-background px-2 text-xs font-medium hover:bg-accent"
										>
											<Copy class="h-3 w-3" /> Copy
										</button>
									</div>
									<p class="mt-2 text-[11px] text-muted-foreground">
										Events to subscribe to:
										<code class="font-mono">checkout.session.completed</code>,
										<code class="font-mono">payment_intent.succeeded</code>.
									</p>
								</div>
							{/if}

							<a
								href={step.href}
								target="_blank"
								rel="noopener noreferrer"
								class="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:text-emerald-800"
							>
								{step.cta}
								<ExternalLink class="h-3 w-3" />
							</a>
						</div>
					</li>
				{/each}
			</ol>

			<p class="mt-5 rounded-lg bg-emerald-500/5 p-3 text-xs text-foreground/80">
				<span class="font-semibold">Not ready for real customers?</span>
				You can paste a Stripe <em>test</em> key (starts with
				<code class="font-mono">rk_test_…</code>) and we’ll let you send yourself a $1 test invoice
				to see the whole flow before going live.
			</p>
		</div>
	{/if}
</section>
